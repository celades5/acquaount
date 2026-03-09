# WoT-Server Tests

This folder is dedicated to small automated integration tests for the WoT-Server. These tests are to be executed once the Getting Started process defined in the main README is completed successfully, using the tests.csv file for the database initialisation. The tests will also use the default ports.
To run the tests, Python 3.13 is required, and the requirements file in this same directory must be installed using the following command:
>python3 -m pip install -r \[Path to requirements.txt\]

Once the requirements are installed, the tests can be run with running the following command (in the terminal, not the Python console):
>pytest