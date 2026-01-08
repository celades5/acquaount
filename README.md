# ACQUAOUNT WoT-Server
## Prerequisites
Docker and Docker Compose are required in order to run WoT-Server. Running the Compose project will automatically create an environment in which all necessary installations will be performed.

To run/deploy:
>docker compose up --build -d

This will deploy the main server and its dependencies: The SensorThings server, the PostGIS database, and a service to fetch data from external platforms.  
The default exposed ports for this deployment are:
 + WoT-Server: Port 2080
 + SensorThings Server: Ports 8008 and 1883
  
These ports can be changed in the docker-compose.yml file.


## Statement Of Need
WoT-Server was created as a centralised data management solution for the ACQUAOUNT Project. One of the objectives of the ACQUAOUNT Project is providing smart irrigation recommendations to farmers using a water balance model. This model takes as input timeseries data of different properties of the specified field, such as temperature, soil moisture and wind speed, and calculates the best date and amount of irrigation. WoT-Server was developed as a standardized API to allow easy access to faming/water management data for further model implementation and to simplify the upload, storage and retrieval procedures of measurements from sensors in the field. WoT-Server is capable of both receiving data via an HTTP endpoint or fetching the data itself from other API services, a feature useful for centralising data from multiple platforms.  
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

The Binding Templates defined inside the thing descriptions describe how to interact with the interaction affordances. For properties, they can be read using a GET request and request parameters, for actions, they can be invoked using a POST request and request body, and special clients can subscribe to events with a special handshake.  

## Postman Collection

The following [Postman collection](https://www.postman.com/orange-comet-247459/workspace/wot-server-example-endpoints/collection/18279882-309079ec-7ba2-4c14-9d69-3f89b1fe321c?action=share&creator=18279882&active-environment=18279882-52d6afdd-3ec1-40b0-976d-2115edbda08d) contains examples on how to interact with WoT-Server.

