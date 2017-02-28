import click
import sys,os
import datetime
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, root_dir)
os.environ["DJANGO_SETTINGS_MODULE"] = "atmosphere.settings"

import django; django.setup()
from dateutil.parser import parse
from core.models import AtmosphereUser, AllocationSource, UserAllocationSource
from core.models.allocation_source import total_usage

def validate_date(ctx,param,value):
    if not value:
        return
    try:
        datetime.datetime.strptime(value,"%Y-%m-%dT%H:%M+00:00")
    except ValueError:
        raise click.BadParameter(' Date format is incorrect. Please format the date as YYYY-MM-DDTHH:MM+00:00, where +00:00 is the time zone')
    try: 
        parse(value)
        return value
    except Exception as e:
        raise click.BadParameter(' %s Date cannot be parsed'%(param.name))
	
def validate_user(ctx,param,value):
    if not value:
        raise click.BadParamter(' Username is required')
    try:
        user = AtmosphereUser.objects.get(username=value)
        return value
    except Exception as e:
        raise click.BadParameter('Invalid user %s'%(e))
    
def validate_allocation_source_name(ctx,param,value):
    if not value:
        return
    try:
        allocation_source = AllocationSource.objects.filter(name=value).last().name
        return value
    except Exception as e:
        raise click.BadParameter('Invalid Allocation Source Name %s'%(e))

def validate_allocation_sourceid(ctx,param,value):
    if not value:
        return
    try:
        allocation_source = AllocationSource.objects.filter(source_id=value).last().name
        return allocation_source
    except Exception as e:
        raise click.BadParameter('Invalid Allocation Source ID %s'%(e))

@click.command()
@click.option('--start_date', help='Report start date\n Format expected :  %Y-%m-%DT%H:%M+00:00 , where +00:00 is the time zone \n Example,  2016-12-01T00:00+00:00', default=None, callback=validate_date)
@click.option('--end_date', help='Report end date\n Format expected :  %Y-%m-%DT%H:%M+00:00 , where +00:00 is the time zone \n Example,  2016-12-01T00:00+00:00', default=None, callback=validate_date)
@click.option('--username', help='Username of the user', required=True, callback=validate_user)
@click.option('--allocation_source_name', help='Name of the Allocation Source', default=None, callback=validate_allocation_source_name)
@click.option('--allocation_source_id', help='Source ID of the Allocation Source', default=None, callback=validate_allocation_sourceid)
def main(start_date,end_date,username,allocation_source_name,allocation_source_id):
    allocationsource_name = allocation_source_name
    name = None
    if allocationsource_name:
        click.echo("\nChecking if User %s is a part of the Allocation Source %s..." %(username, allocationsource_name))
        try:
            UserAllocationSource.objects.filter(user__username=username,allocation_source__name=allocationsource_name).last().allocation_source.name
            name = allocationsource_name
        except:
            raise click.BadParameter('User %s is not a part of the Allocation Source %s'%(username,allocationsource_name))

    if allocation_source_id and not allocation_source_name:
        click.echo("Checking if User %s is a part of the Allocation Source %s provided..." %(username, allocation_source_id))
        try:
            obj = UserAllocationSource.objects.filter(user__username=username,allocation_source__source_id=allocation_source_id).last().allocation_source.name
            name = obj.allocation_source.name
        except:
            raise click.BadParameter('User %s is not a part of the Allocation Source %s'%(username,allocation_source_id))
    if not start_date:
        start_date = AtmosphereUser.objects.get(username=username).date_joined if AtmosphereUser.objects.get(username=username).date_joined > parse('2016-09-01T00:00+00:00') else '2016-09-01T00+00+00:00'   
   
    if name:
        allocations =  total_usage(username,start_date,end_date=end_date,allocation_source_name=name)
        print '\nTotal Allocation Sources used by '+ username+ ' for Allocation Source ' + name + ' are = %s \n' % allocations
    else:
        print '\nTotal Allocation Sources used by '+ username + ' are: \n'
        total = 0
        for obj in UserAllocationSource.objects.filter(user__username=username).all():      
	    allocations = total_usage(username,start_date,allocation_source_name=obj.allocation_source.name,end_date=end_date)
            total+= allocations
            print '    %s = %s\n' %(obj.allocation_source.name,allocations)
        print 'Total Allocations Used = %s\n'%(total)

if __name__=='__main__':
    main()

