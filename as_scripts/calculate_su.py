import click
import sys,os
import datetime
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, root_dir)
os.environ["DJANGO_SETTINGS_MODULE"] = "atmosphere.settings"

import django; django.setup()
from dateutil.parser import parse
from core.models import AtmosphereUser
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
	

@click.command()
@click.option('--end_date', help='Report end date\n Format expected :  %Y-%m-%DT%H:%M+00:00 , where +00:00 is the time zone \n Example,  2016-12-01T00:00+00:00', default=None, callback=validate_date)
@click.argument('start_date', 'Report start date\n Format expected :  %Y-%m-%DT%H:%M+00:00 , where +00:00 is the time zone \n Example,  2016-12-01T00:00+00:00', callback=validate_date)
def main(start_date,end_date):
    click.echo("Calculating SUs. Please wait...")
    user_total = []
    for user in AtmosphereUser.objects.all():
        user_total.append(total_usage(user.username,start_date,end_date=end_date))
    print sum(user_total)

if __name__=='__main__':
    main()

