from datetime import datetime, timedelta
from ftplib import FTP
from threading import Lock

ftp_host = ''
ftp_user = ''
ftp_password = ''

headers = []
output_data = []
device_id = ""

lock = Lock()

def process_line(line):
    global headers, output_data, device_id
    line_sp = line.split(";")
    if line_sp[0] == "CL":
        headers = list(map(lambda h: h.replace("\"", ""), line_sp[2:]))
    if line_sp[0] == "D":
        listed_row = list(map(lambda h: h.replace("\"", ""), line_sp[2:]))
        row_timestamp = line_sp[1].replace("\"", "")

        date_format = "%Y-%m-%d %H:%M:%S"
        dt_object = datetime.strptime(row_timestamp, date_format)
        # Conversion from Lebanon time to UTC
        dt_object = dt_object - timedelta(hours=3)
        formatted_timestamp_string = dt_object.strftime("%Y-%m-%dT%H:%M:%SZ")

        for i, measure in enumerate(listed_row):
            if measure == "":
                continue
            measure_value = float(measure)
            measure_key = headers[i].replace("+", "")
            measure = {
                'info': {
                    'deviceID': device_id,
                    'timestamp': formatted_timestamp_string
                },
                'values': {
                    measure_key: measure_value
                }
            }
            output_data.append(measure)


def get_function(thing, ftplock=None):
    def get_data_from_elard():
        global output_data, device_id
        lock.acquire()
        if ftplock is not None:
            ftplock.acquire()


        output_data = []
        headers = []
        device_id = thing

        ftp = FTP()

        ftp.connect(ftp_host, port=9008)
        ftp.login(ftp_user, ftp_password)

        files = ftp.nlst()
        # print("Files in the current directory:", files)

        current_date = datetime.utcnow()

        files = files[::-1]

        for file in files:
            if file.startswith(thing):
                date_format = "%Y-%m-%dT%H-%M-%S"
                try:
                    filedate = datetime.strptime("20" + file.split("_")[1].replace(".csv", ""),
                                                 date_format) - timedelta(hours=3)
                except IndexError:
                    continue
                difference = current_date - filedate
                if difference.total_seconds() < 24 * 3600:
                    ftp.retrlines(f"RETR {file}", callback=process_line)
                else:
                    break


        ftp.quit()
        if ftplock is not None and ftplock.locked():
            ftplock.release()
        lock.release()
        return output_data

    return get_data_from_elard


def get_historic_function(thing, ftplock=None):
    def get_data_from_elard():
        global output_data, headers, device_id
        lock.acquire()
        output_data = []
        headers = []
        device_id = thing

        if ftplock is not None:
            ftplock.acquire()
        ftp = FTP()

        ftp.connect(ftp_host, port=9008)
        ftp.login(ftp_user, ftp_password)

        files = ftp.nlst()

        for file in files:
            if file.startswith(thing):
                ftp.retrlines(f"RETR {file}", callback=process_line)

        ftp.quit()
        if ftplock is not None and ftplock.locked():
            ftplock.release()
        lock.release()
        return output_data

    return get_data_from_elard


if __name__ in "__main__":
    func = get_function('36231677')
    print(func())
