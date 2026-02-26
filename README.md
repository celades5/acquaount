# ACQUAOUNT WoT-Server
## Prerequisites
Docker and Docker Compose are required in order to run WoT-Server. Running the Compose project will automatically create an environment in which all necessary installations will be performed.

## Getting Started
Before deploying the server, the Things must be created. Even though creating them while the deployed server is possible, creating them beforehand is cleaner and faster.  

To create new Things that will be deployed once the server is started, the user must navigate to the _src/resources/thingDescription/Things_ folder and create as many Things as desired. To create a Thing, simply the Demo Thing description and change the id, title, name, and description. It is important that all Things (except main.td.json) are placed in this folder and that the filename ends in "_.td.json_".  

Once things are defined, the WoT-Server can be deployed. To run/deploy:
>docker compose up --build -d

This will deploy the main server and its dependencies: The SensorThings server, the PostGIS database, and a service to fetch data from external platforms.  
The default exposed ports for this deployment are:
+ WoT-Server: Port 2080
+ SensorThings Server: Ports 8008 and 1883

These ports can be changed in the docker-compose.yml file.  

After deploying the server, the datastreams must be created. They can be created using the examples provided in the Postman collection at the end of this document or the Python script _init_database.py_ available in the _src/resources/databaseInitialisation_ folder. To define the datastreams, CSV files are used. There are many examples in the same folder, the following list explains all the columns found in these CSV files. Columns in **bold** indicate the data is mandatory for the datastream to be created and must be unique between different instances. Other columns are optional.
+ Placeholder: Empty column created to avoid decrypting errors at the beginning of some rows.
+ Pilot: The pilot test location of this datastream.
+ **Field Name**: The name of the field where this datastream will be observed.
+ Field Description: A description of the field.
+ Field Longitude and Field Latitude: The location of the field.
+ **Device ID**: The name of the sensor used to observe the datastream.
+ Device Description: A description of the sensor used.
+ Device Type: A short string used to identify the make and model of the sensor.
+ Device EUI: A number to identify the sensor.
+ **Property Key**: The key of the property observed in the datastream. It needs to be unique in the sensor.
+ Property Name: The name of the property observed in the datastream. It differs in the Property Key because it can be duplicated, for example for a sensor that reads Soil Moisture at multiple depths. Keys must be unique (Soil_Moisture_1, _2, ...) but the name can be repeated.
+ Property Description: A description of the property.
+ Unit Of Measurement and Unit Of Measurement Symbol: Name and symbol of the unit of measurement of the data in the datastream.
+ **Datastream Name**: The datastream name. In the examples it's generated automatically as \<Field Name\>\_\<Device ID\>\_\<Property Name\> and replacing the spaces for underscores but this naming convention is not enforced.
+ Datastream Description: A description of the datastream. Like with the name, it's generated automatically, but it's not mandatory to follow the same structure.
+ Averages: Use to define if there should be a weekly aggregate of this datastream by setting this column as 'Weekly'.

The script will handle the creation of all types of instances, extracted from the rows of data, while making sure to not create duplicates. The script was created and tested using Python 3.13, which you must install to run the script. Once Python 3.13 is installed, the dependencies to run the script must be installed using the following command, taking into account the fact that the path to the requirements.txt file will change depending on the working directory:  
>python3 -m pip install -r \[Path to requirements.txt\]  

Once the dependencies are installed, the script is executed with the following command:
>python3 init_database.py \<csv_file.csv\> \[\<SensorThings Server URL\>\]  
 
The arguments for this script are first, a path to a csv file containing the data to be uploaded in the format described previously. Second, the URL to the server can be specified optionally (it will use a default value from inside the Docker network if not specified). If a custom URL is used, it should be defined WITHOUT a "/" at the end, to avoid errors. Finally, this script can be run as many times as necessary, and it will check for duplicates every time. It is not necessary to run every time the WoT-Server is redeployed, since data is stored in a volume and persisted between sessions.  

## Statement Of Need
WoT-Server was created as a centralised data management solution for the ACQUAOUNT Project. One of the objectives of the ACQUAOUNT Project is providing smart irrigation recommendations to farmers using a water balance model. This model takes as input timeseries data of different properties of the specified field, such as temperature, soil moisture and wind speed, and calculates the best date and amount of irrigation. WoT-Server was developed as a standardized API to allow easy access to farm/water management data for further model implementation and to simplify the upload, storage and retrieval procedures of measurements from sensors in the field. WoT-Server is capable of both receiving data via an HTTP endpoint or fetching the data itself from other API services, a feature useful for centralising data from multiple platforms.  
Since it was needed that users and developers could interact with the platform easily and consistently, WoT-Server follows the Web-Of-Things standard. This standard provides a common framework for describing and accessing connected devices and services through Thing Descriptions, enabling a uniform interface for interaction regardless of device type or communication protocol. However, since WoT-Server also needed a well-defined data model to store and organise its sensor data, the platform uses the OGC SensorThings standard as the database structure, which provides a standardised model for representing IoT entities such as Things, Sensors, Properties, and Datastreams, along with their timeseries Observations. Using SensorThings ensures that all data stored in WoT-Server follows a consistent and extensible structure, making it easier to query, analyse, and share.  
All AI-based applications require data, and most if not all IoT applications obtain this data from sensors in timeseries format. The aim of WoT-Server is to provide a platform to easily manage this type of data with minimal setup and configuration required, letting users focus on the tasks specific to their use case. With WoT-Server, all developers creating IoT applications can have a platform where they can store their data up and running in minutes, which they can use to create AI models.

## Thing Interaction Affordances

Each physical location can be interacted with by following the WoT protocol, with the following interaction affordances:  

 + (field/station/item)Information: Provides some static information about the field/station/item of this thing.  
 + propertiesList: Provides a list of all the properties being observed at this field/station/item.  
 + propertyInformation: Provides detailed information about one of the properties.  
 + datastreamsList: Provides a list of datastreams in the field/station/item. A datastream is the flow o data defined by the combination of a Thing, Sensor, and Property.  
 + datastreamInformation: Provides detailed information about one datastream.  
 + datastreamLastMeasure: Provides the last measure taken in a specified datastream.  
 + datastreamMeasures: Provides all the measures taken in a specified datastream.  
 + lastMeasures: Provides the last measures taken in all datastreams.  

Some types of items also have the following properties:  

 + sensorsList: Provides a list of the sensors in this field/item.  
 + sensorInformation: Provides detailed information about one of the sensors.  

All types of things have available at least this action affordance, used to upload data to the platform.  

 + receiveMeasure: Used as an endpoint for the sensors to upload data to the platform.

Finally, all types of Things have the same event affordance, which can be subscribed to, in order to perform an action every time it triggers.  

 + newObservation: This event is triggered every time there is a new measure in the system.

The Binding Templates defined inside the thing descriptions describe how to interact with the interaction affordances. For properties, they can be read using a GET request and request parameters, for actions, they can be invoked using a POST request and request body, and special clients can subscribe to events with a special handshake. To see in detail the required parameters to call an interaction affordance and the structure of its returns, check the [Base Thing Description](src/resources/thingDescription/Things/base.td.json).  

## Testing And Verification

WoT-Server does not have automated tests, the following [Postman collection](https://www.postman.com/orange-comet-247459/workspace/wot-server-example-endpoints/collection/18279882-309079ec-7ba2-4c14-9d69-3f89b1fe321c?action=share&creator=18279882&active-environment=18279882-52d6afdd-3ec1-40b0-976d-2115edbda08d) can be used to test functionality. The collection contains example HTTP requests for how to interact with WoT-Server and also examples of successful HTTP responses so they can be compared with individual results. 

## AI Usage Disclosure
Generative AI (ChatGPT) has been used in small sections of code development, mostly confined in Docker and Docker Compose related files. No Generative AI has been used to write the documentation or the paper related to the repository. 