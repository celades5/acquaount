---
title: 'WoT-Server: Combining the Web-Of-Things and SensorThings standards to build an IoT platform'
tags:
  - JavaScript
  - IoT
  - WoT
  - SensorThings
  - ACQUAOUNT
  - Irrigation
authors:
  - given-names: Joel
    surname: Aumedes
    orcid: 0009-0006-9011-0853
    affiliation: 1
  - given-names: Xavier
    surname: Celades
    affiliation: 1
  - given-names: Josep
    surname: Pijuan
    affiliation: 1
  - given-names: Robert
    surname: Sanfeliu
    affiliation: 1
affiliations:
 - name: Centre Tecnològic Eurecat, Catalonia, Spain
   index: 1
date: 30 October 2025
bibliography: paper.bib
---

# Summary
This document presents WoT-Server, a JavaScript IoT server that combines the abstraction of the Web-Of-Things Standard [@w3c2024] and the data model of the SensorThings Standard [@liang2024] to provide a simple interface for storing and requesting data in time series format. WoT-Server provides simplified access to the different instances required for organised storage of IoT time series data via easily accessible HTTP endpoints, which can also be adapted for access through different protocols such as CoAP and MQTT.
This paper describes the concepts and techniques used in the development of this tool. It also demonstrates its use in a water management/irrigation application, presenting the original use case developed in the ACQUAOUNT project [@acquaount2024], a project funded by the European Union with the objective of providing tools for efficient use of water.

# Statement Of Need 
WoT-Server was initially created as a centralised data management solution for the ACQUAOUNT Project. One of the objectives of the ACQUAOUNT Project is to provide smart irrigation recommendations to farmers using a water balance model. However, the challenges it addresses are common across many research domains that rely on IoT data, such as agriculture, environmental monitoring, hydrology, and smart cities. WoT-Server acts as a centralized, interoperable, and easily deployable API to allow easy access to sensor data for further model implementation and simplifies the upload, storage and retrieval procedures of measurements from sensors in the field. WoT-Server is capable of both receiving data via an HTTP endpoint or fetching the data itself from other API services, a feature useful for centralising data from multiple platforms. The intended users for WoT-Server are researchers and practitioners building interoperable IoT data infrastructures compliant with W3C and OGC standards in many research domains.  
The aim of WoT-Server is to provide a platform with minimal setup, aligned to standards, and with a centralized API that enables easy management of time series data for research-grade IoT data management, letting users focus on the tasks specific to their use case. With WoT-Server, developers creating IoT applications gain access to a platform where they can have their data storage up and running in minutes and use it to create AI models. By providing WoT-Server as a reference architecture and open-source implementation combining Web-Of-Things and SensorThings, into a lightweight data platform, this service is provided to scientific teams that require structured time-series storage but don't wish to commit to enterprise-scale IoT ecosystems.

# State Of The Art
Many implementations of the Web-Of-Things standard are available in open source format. However, these existing Web of Things implementations such as node-wot [@eclipsethingweb2024] (the one used in this project) and Mozilla WebThings [@mozilla2019] primarily focus on device interaction and scripting, and do not natively provide persistent, standardized storage mechanisms comparable to SensorThings-compliant servers. Other existing IoT platforms partially address this need but not in a single solution. Standard-compliant implementations such as FROST-Server [@fraunhofer2024] provide robust support for the OGC SensorThings API but require substantial configuration and infrastructure knowledge, and do not provide both the simplicity of WoT and the SensorThings data model to store the data. Full-stack IoT platforms like ThingsBoard [@thingsboard2026] and FIWARE [@fiware2026] are overly complex solutions for the use cases that WoT-Server aims to service, such as research prototypes and short-term scientific deployments. To the authors’ knowledge, WoT-Server is among the first open-source platforms to combine the Web of Things interaction model with a SensorThings-compliant data model and persistent storage.

# Design And Implementation
According to project requirements, the platform must consist of a WoT-compliant API implementation that manages the heterogeneity of the different sources of data found in the project, such as different types of in-situ sensors or different weather stations, by providing a common interface for data exchange. This solution addresses one of the main problems of IoT, the platform fragmentation, and defines how a sensor should communicate its data to the platform.  
To provide all the required functionalities of the project in a clean and efficient manner, the platform is divided into multiple services, all of them virtualized and deployed using Docker [@docker2026]. A basic diagram of the services and their connections can be seen in \autoref{fig3}.  

![Diagram of the WoT platform and all related services.\label{fig3}](diagramaserver.png)  

The main service is the WoT server, developed using node-wot. This service provides all the controllers that manage the requests sent by the sensors and the gateways. To provide persistent storage of the data, a PostGIS database is used [@postgis2026]. However, to simplify the development process and to maintain consistency with the standards, FROST-Server, a SensorThings compliant server, is used to access the database. Then, the data integration service imports data from external platforms into the WoT platform, either by directly requesting it to the external platform or by fetching it from an FTP server where it has been uploaded. In addition, the watchdog service monitors if the server and the data integration service are online and have not crashed and gone offline. If this happens, the watchdog sends an email to the server administrator to restart the service as soon as possible to avoid missing data being sent from the sensors. Finally, the monitoring platform provides a graphical way to check if data is correctly being uploaded to the server.  

Inside the WoT server, Things are defined as the closest possible match to a physical location [@kaebisch2024]. Each physical location can be accessed through interaction affordances, described in the README.md file. These interaction affordances function as a bridge between the user and the data stored in the SensorThings database. Since the WoT model and the SensorThings model share the Thing as a common instance, they can collaborate to create a model that is complete and detailed but abstract and simple to interact with at the same time, as seen in \autoref{fig4}.  
 
![Diagram of WoT being used as the interface to access the SensorThings data model.\label{fig4}](diagramacombinat.png)

# Use Case

WoT-Server is one of the core tools of the ACQUAOUNT Project, a project funded by the European Union via the PRIMA program and supported by Horizon 2020, with the objective of developing a variety of innovative tools focused on making the use of water at farm level and basin level as efficient as possible. These technologies are developed and evaluated in four areas of the Mediterranean area (Sardinia, Italy; Bekaa Valley, Lebanon; Al-Jifārah plain, Tunisia; Central Jordan Valley, Jordan), seen in the map in \autoref{fig5}.  

![Map of the Pilot Locations of the ACQUAOUNT Project.\label{fig5}](Mapa.png){ width=90% }  

The ACQUAOUNT Project has many lines of research and development, such as sensor installation, LoRaWAN networks, or basin modelling. WoT-Server acts as the link between the sensors and platforms and the models, storing data and providing functionalities in a standardized way. WoT-Server stores the data received from the data sources and provides it to services that calculate recommendations based on this data. Once the services finish the calculations, the results are also stored in WoT-Server to be consumed by the dashboard and frontend services to be displayed to the final users in a graphical and understandable way.  

# Acknowledgements
Financial support has been provided by the European Union via the PRIMA programme and supported by the Horizon 2020 financial instrument.  

# References