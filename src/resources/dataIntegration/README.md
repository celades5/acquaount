# ACQUAOUNT Data Integration Service

## Prerequisites

The Data Integration Service runs as a Docker container together with the main WoT-Server and databases. It is run from
the docker-compose.yml file found in the root of the project. Alternatively, the Data Integration Service for historic
data is run by running the docker-compose.yml file in this repository. To run any docker-compose.yml file, navigate to
its location and run this command:
> docker compose up --build -d

To run the Data Integration Service for historic data successfully, it needs to run in the same machine as the
WoT-Server, since they will interact by connecting to the same Docker network.

## Getting Started

There are two parts to creating a job in the Data Integration Service: Coding the job itself and configuring the job in
the service.

### Coding the job

The process of coding the job will be custom to the platform that the data is being fetched from or the use case. This
directory contains two examples, averageCalculator.py and elard.py. averageCalculator.py is a job that runs weekly,
going through all datastreams and creating average weekly measures on datastreams that start with AVG_WEEKLY. elard.py
is an example of a service that fetches data from an FTP server and parses it to the required format for the WoT-Server.

To create a job that fetches data and uploads it to the platform, the developer must create a function that returns a list of measures. Measures are JSON objects that have the following structure:
```json
{
  "info": {
    "deviceID": device_id,
    "timestamp": formatted_timestamp_string
  },
  "values": {
    measure_key: measure_value
  }
}
```
In this representation, device_id, formatted_timestamp_string, measure_key, and measure_value, are the custom values of the measure to create. The timestamp string must be formatted using this format "%Y-%m-%dT%H:%M:%SZ" and all values must match an existing datastream.

### Configuring the job
Jobs must be configured in the dataIntegrationService.py file, below a comment that says "CONFIGURE JOBS HERE". To create a job, simply use the function create_job, which takes 4 mandatory parameters and 1 optional parameter. The parameters are as follows:
 - job_name: A name for this job. Only used for logging.
 - obtain_data_function: The function created previously, a function that, when executed, returns a list of measures. Careful when passing this function to not execute it, as this will pass the list of measures itself and will cause errors when running the job.
 - send_data_function: A function to execute once the measures are fetched. The script provides two basic ones, send_timeseries_data and save_json_file. For most use cases, send_timeseries_data will be enough, it simply takes the list of measures and uploads it to WoT-Server, but custom functions can be created and used.
 - thing_url: The thing's name part of the url. Used to identify to which thing to upload the measures. It should not contain the IP or URL address of the server, only the thing name. The send_timeseries_data is prepared to be used with the WoT-Server and the Data Integration Service on the same Docker network.
 - is_ftp (Default: False): Set it to true if the function to obtain data uses the ftplib library, since using it concurrently might cause problems. This also means that the function obtaining the data has an ftp lock, implemented using the threading library.

Once the job is created, the only remaining part is appending it to a list to define how often it should run, either weekly, daily, or every three hours. An example of the entire process is shown below.
```python
import elard

elard_job = create_job(f"Elard - Site 36",
                       elard.get_function("36", ftplock=ftplock),
                       send_timeseries_data,
                       f"AcquaountElard36", is_ftp=True)
three_hour_jobs.append(elard_job)
```
This example creates the job "Elard - Site 36", which runs every three hours. The function for getting the last three hours' data is created when running get_function from the elard file. This higher order function is used to create different functions programatically, without having to code them individually. Finally, the data is uploaded to the WoT-Server using send_timeseries_data.

## Historic And Periodic Jobs
Up until now, this README has described periodic jobs, but in some cases it might be desired to create jobs that fetch historic data and only have to run once, for example, when integrating a new data source, developers might want to integrate all previous data, not just data starting from that point. To do this, create a function that returns the historic data as a list of measures, then find the section of the code below the "CONFIGURE HISTORIC JOBS HERE" and simply configure a job the same way as a periodic job, but instead of appending it to the list, simply run it. This will allow jobs to run concurrently.
```python
import elard

elard_job = create_job(f"Elard - Site 36 - Historic",
                       elard.get_historic_function("36", ftplock=ftplock),
                       send_timeseries_data,
                       f"AcquaountElard36", is_ftp=True)
elard_job()
```
This example will run a job that fetches all historic data from elard's site 36 and uploads it to the WoT-Server.  

A recommendation when integrating historic data is using the save_json_file function instead of the send_timeseries_data function, and then uploading the data using the upload parameter. This way, if the upload process fails during its execution, it can be resumed from the point where it failed instead of having to start again. To do this, first run the docker-compose.yml file available in this folder, making sure that in the DockerfileHistoric file, the CMD line that has historic on it is enabled, and the CMD line with upload is not.This will run the functions to gather the data and store them in a volume. Once completed, rerun the docker-compose but changing the CMD lines in the DockerfileHistoric file to enable the CMD line with upload and disable the one with historic. This will start uploading the measures saved in the files, displaying its process so it can be restarted at the correct spot using the skip_names and start_measure variables in the upload section of dataIntegrationService.py. 