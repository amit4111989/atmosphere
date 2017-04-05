import uuid
from django.db.models.signals import post_save
from core.hooks.allocation_source import (
    listen_for_allocation_threshold_met,
    listen_for_instance_allocation_changes,
    listen_for_allocation_source_created_or_renewed,
    listen_for_allocation_source_compute_allowed_changed
)
from behave import *
from mock_jetstream_driver import fill_user_allocation_sources
from core.models import (
    EventTable, AllocationSource, Instance, Size, AllocationSourceSnapshot,
    ProviderMachine, InstanceStatusHistory, AtmosphereUser, UserAllocationSnapshot)
from core.models.allocation_source import total_usage
from datetime import timedelta
from dateutil.rrule import rrule, MINUTELY
from dateutil.parser import parse
from django.utils import timezone
from api.tests.factories import (
     InstanceFactory, InstanceHistoryFactory, InstanceStatusFactory,
    ProviderMachineFactory, IdentityFactory, ProviderFactory)

# MOCK TASK: MONITOR ALLOCATION SOURCES

def monitor_jetstream_allocation_sources(user_list,new_allocation):
    """
    Queries the TACC API for Jetstream allocation sources
    Adds each new source (And user association) to the DB.
    """
    resources = fill_user_allocation_sources(user_list,new_allocation)
    return True

# MOCK TASK: UPDATE SNAPSHOT

def update_snapshot(allocation_source_name, required_username, start_date=None, end_date=None):
    end_date = end_date or timezone.now()
    # TODO: Read this start_date from last 'reset event' for each allocation source
    start_date = start_date or '2016-09-01 00:00:00.0-05'

    total_burn_rate = 0
    total_compute_used = 0

    allocation_source = AllocationSource.objects.filter(name=allocation_source_name).order_by('id').last()

    created_or_updated_event = EventTable.objects.filter(name='allocation_source_created_or_renewed',
                                                                payload__allocation_source_name=allocation_source.name).order_by('timestamp').last()

    if created_or_updated_event:
        #if renewed, change ignore old allocation usage
        start_date = created_or_updated_event.payload['start_date']

    for user in allocation_source.all_users:
        if user.username!=required_username:
            continue
        compute_used, burn_rate = total_usage(user.username, start_date, allocation_source_name=allocation_source.name ,end_date=end_date,burn_rate=True)

        total_burn_rate +=burn_rate
        snapshot, created = UserAllocationSnapshot.objects.update_or_create(
            allocation_source_id=allocation_source.id,
            user_id=user.id,
            defaults={
                'compute_used': compute_used,
                'burn_rate': burn_rate
            }
        )

        total_compute_used+=compute_used

    # MAKE SURE THAT WE ARE ONLY LOOKING AT MOST RECENT ACTIVE ALLOCATION SOURCES
    snapshot, created = AllocationSourceSnapshot.objects.update_or_create(
        allocation_source_id=allocation_source.id,
        defaults={
            'compute_used': total_compute_used,
            'global_burn_rate': total_burn_rate
        }
    )
    return True


@given('TAS Api has a new Allocation Source')
def step_impl(context):
    for row in context.table:

        context.current_time = timezone.now()

        context.new_allocation = {u'computeAllocated': 50000,
          u'computeRequested': int(row['compute allowed']),
          u'computeUsed': 0,
          u'dateRequested': u'2017-04-03T19:01:11Z',
          u'dateReviewed': u'2017-04-03T19:01:11Z',
          u'decisionSummary': u'Automatic TG AMIE approval.',
          u'end': u'2018-04-02T05:00:00Z',
          u'id': int(row['source id']),
          u'justification': u"TeraGrid 'New' allocation.",
          u'memoryAllocated': 0,
          u'memoryRequested': 0,
          u'project': str(row['name']),
          u'projectId': 33974,
          u'requestor': u'Dwayne John',
          u'requestorId': 12738,
          u'resource': u'Jetstream',
          u'resourceId': 44,
          u'reviewer': None,
          u'reviewerId': 0,
          u'start': str(context.current_time),
          u'status': u'Active',
          u'storageAllocated': 0,
          u'storageRequested': 0}

@given('Users are a part of the allocation source')
def step_impl(context):
    context.user_list = []
    for row in context.table:
        AtmosphereUser.objects.get_or_create(username=row['username'])
        context.user_list.append(row['username'])

@when('monitor_allocation_source task is run')
def step_impl(context):
    monitor_jetstream_allocation_sources(
        context.user_list,context.new_allocation)

@when('User launch Instance')
def step_impl(context):
    context.instance = {}
    for row in context.table:
        user, _ = AtmosphereUser.objects.get_or_create(username=row['username'])
        try:
            time_created = context.current_time if str(row['start date'])=='current' else parse(str(row['start date']))
        except Exception as e:
            raise Exception('Parsing the start date caused an error %s'%(e))
        provider_alias = launch_instance(user, time_created, int(row["cpu"]))
        assert provider_alias is not None
        context.instance[row['instance id']] = provider_alias


@when('User adds instance to allocation source')
def step_impl(context):
    for row in context.table:
        provider_alias = context.instance[row['instance id']]

        assert AllocationSource.objects.get(
            name=str(context.new_allocation['project'])).name

        source_name = AllocationSource.objects.get(
            name=str(context.new_allocation['project'])).name

        e = EventTable.objects.create(name="instance_allocation_source_changed",
                           payload= {"instance_id": str(provider_alias),
                             "allocation_source_name": source_name},
                           entity_id=row['username'] )



@when('User instance runs for some days')
def step_impl(context):
    for row in context.table:
        user = AtmosphereUser.objects.filter(username=row['username']).last()
        provider_alias = context.instance[row['instance id']]
        #get last instance_status_history
        last_history = InstanceStatusHistory.objects.filter(instance__provider_alias=provider_alias).order_by('start_date').last()
        if str(row['status'])=='active':
            time_stopped = last_history.start_date + timedelta(days=int(row['days']))
            change_instance_status(user,provider_alias,time_stopped,'suspended')
        else:
            change_instance_status(user, provider_alias, last_history.start_date, row['status'])
            last_history.delete()

@then('Allocation Source is in the Model')
def step_impl(context):
    source = AllocationSource.objects.filter(
        name=context.new_allocation['project']).last()

    assert source


@then('Creation Event is Fired')
def step_impl(context):
    event = EventTable.objects.filter(
        name="allocation_source_created_or_renewed",
        payload__allocation_source_name=context.new_allocation['project']).last()

    assert event

@then('Compute Allocated Changed Event is Fired')
def step_impl(context):
    event = EventTable.objects.filter(
        name="allocation_source_compute_allowed_changed",
        payload__allocation_source_name=context.new_allocation['project']).last()

    assert event

@then('update_snapshot calculates correct compute_used in UserAllocationSnapshot')
def step_impl(context):
    for row in context.table:
        no_of_intervals = int(row['number of times update_snapshot runs'])
        end_date= context.current_time+timedelta(minutes=no_of_intervals*int(row['time between runs in minutes']))
        celery_iterator = list(rrule(MINUTELY, interval=no_of_intervals, dtstart=context.current_time, until=end_date))

        prev_time = ''
        for current_time in celery_iterator:
            if not prev_time:
                prev_time = current_time
                continue
            update_snapshot(context.new_allocation['project'], row['username'], start_date=prev_time, end_date=current_time)
            prev_time = current_time

        userid = AtmosphereUser.objects.get(username=row['username']).id
        allocationsourceid = AllocationSource.objects.get(name=context.new_allocation['project']).id
        user_snapshot = UserAllocationSnapshot.objects.get(user_id=userid, allocation_source_id=allocationsourceid).compute_used
        assert float(user_snapshot)==float(row['total compute used'])


@when('Allocation Source is renewed in TAS Api')
def step_impl(context):

    for row in context.table:
        context.current_time = context.current_time + timedelta(days=int(row['days after original start date']))
        context.new_allocation = {u'computeAllocated': int(row['compute allowed']),
                                  u'computeRequested': int(row['compute allowed']),
                                  u'computeUsed': 0,
                                  u'dateRequested': u'2017-04-03T19:01:11Z',
                                  u'dateReviewed': u'2017-04-03T19:01:11Z',
                                  u'decisionSummary': u'Automatic TG AMIE approval.',
                                  u'end': u'2018-04-02T05:00:00Z',
                                  u'id': int(row['new source id']),
                                  u'justification': u"TeraGrid 'New' allocation.",
                                  u'memoryAllocated': 0,
                                  u'memoryRequested': 0,
                                  u'project': str(row['name']),
                                  u'projectId': 33974,
                                  u'requestor': u'Dwayne John',
                                  u'requestorId': 12738,
                                  u'resource': u'Jetstream',
                                  u'resourceId': 44,
                                  u'reviewer': None,
                                  u'reviewerId': 0,
                                  u'start': str(context.current_time),
                                  u'status': u'Active',
                                  u'storageAllocated': 0,
                                  u'storageRequested': 0}

@then('Renewal Event is Fired')
def step_impl(context):
    event = EventTable.objects.filter(
        name="allocation_source_created_or_renewed",
        payload__allocation_source_name=context.new_allocation['project']).last()

    assert event

########### Helpers ###############

def launch_instance(user,time_created,cpu):
    # context.user is admin and regular user
    provider = ProviderFactory.create()
    from core.models import IdentityMembership, Identity
    user_group = IdentityMembership.objects.filter(member__name=user.username)
    if not user_group:
        user_identity = IdentityFactory.create_identity(
            created_by=user,
            provider=provider)
    else:
        user_identity = Identity.objects.all().last()
    admin_identity = user_identity

    provider_machine = ProviderMachine.objects.all()
    if not provider_machine:
        machine = ProviderMachineFactory.create_provider_machine(user, user_identity)
    else:
        machine = ProviderMachine.objects.all().last()

    status = InstanceStatusFactory.create(name='active')

    instance_state = InstanceFactory.create(
    provider_alias=uuid.uuid4(),
    source=machine.instance_source,
    created_by=user,
    created_by_identity=user_identity,
    start_date=time_created)


    size = Size(alias=uuid.uuid4(), name='small', provider=provider, cpu=cpu, disk=1, root=1, mem=1)
    size.save()
    InstanceHistoryFactory.create(
        status=status,
        activity="",
        instance=instance_state,
        start_date = time_created,
        size=size
    )

    return instance_state.provider_alias


def change_instance_status(user,provider_alias,time_stopped, new_status):

    active_instance = Instance.objects.filter(provider_alias=provider_alias).last()

    size = Size.objects.all().last()

    status_history = InstanceStatusHistory.objects.filter(instance=active_instance).last()
    status_history.end_date = time_stopped
    status_history.save()

    status = get_instance_state_from_factory(new_status)
    InstanceHistoryFactory.create(
        status=status,
        activity="",
        instance=active_instance,
        start_date = time_stopped,
        size=size
    )

def get_compute_used(allocation_source,current_time,prev_time):

    compute_used = 0
    for user in allocation_source.all_users:
        compute_used += total_usage(user.username, start_date=prev_time,
                    end_date=current_time, allocation_source_name=allocation_source.name)

    return compute_used

def get_instance_state_from_factory(status):
    if str(status)=='active':
        return InstanceStatusFactory.create(name='active')
    if str(status)=='deploy_error':
        return InstanceStatusFactory.create(name='deploy_error')
    if str(status)=='networking':
        return InstanceStatusFactory.create(name='networking')
    if str(status) == 'suspended':
        return InstanceStatusFactory.create(name='suspended')