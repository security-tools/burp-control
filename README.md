# BurpControl

BurpControl is a tool for automating security vulnerability scans with [Burp Suite Professional]


## Introduction

BurpControl, in conjunction with Burp Suite Professional, provides the following features:

* Run a Burp site crawl in headless or GUI mode
* Run a Burp vulnerability scan in headless or GUI mode
* Configure in and out-of-scope URL(s) for Burp's crawler and scanner
* Use externals UI or API tests to extend Burp's target sitemap
* Generate a scan report in HTML/XML format.
* Shut down Burp

## Prerequisites

* [Burp Suite Professional]
  A commercial web vulnerability scanner by Portswigger.
* [Burp REST API Extension]
  A Burp extensions that adds a REST API to Burp.
* [Node.js]
  Javascript runtime for BurpControl.
  
## Setup

1. Setup Burp Professional and configure a valid license
2. Build and install [Burp REST API Extension]
3. Create a configuration (JSON) for the target application.

### Running Burp with the REST API Extension

On Windows/Linux:

```sh
java -jar -Xmx2G burp-rest-api-1.0.3.jar --headless.mode=false \
--config-file=burp-default-project-options.json --user-config-file=burp-user-options.json
```

BurpControl can also start up Burp in the background with the command 'burpctl start'.

### BurpControl Configuration

```json
{
  "burp_lib": "burp-rest-api-1.0.3.jar",
  "burp_options": [
    "-Xmx1024M",
    "--headless.mode=true"
  ],
  "proxy_url": "localhost:8080",
  "api_url": "http://localhost:8090",
  "report_type": "HTLM",
  "crawl_targets": [
    "https://targetapp.herokuapp.com" 
  ],
  "scan_targets": [
    "https://targetapp.herokuapp.com/api"
  ],
  "targetScope": {
    "include": [ "https://targetapp.herokuapp.com" ],
    "exclude": [ "http://github.com" ]
  }
}
```

### Command-line options

```sh
  Usage: burpctl [options] [command]

  Options:

    -V, --version              output the version number
    -h, --help                 output usage information

  Commands:

    crawl [config]             Crawl using the specified config file
    scan [options] [config]    Scan using the specified config file
    report [options] [config]  Generate a report using the specified config file
    start [config]             Start Burp Suite using the specified config file
    stop [config]              Stop Burp Suite using the specified config file
    status [config]            Return the Burp Suite status using the specified config file

```

### Typical workflow

1. Create a BurpControl config.json file containing the URL(s) of the target application.

2. Start up Burp with the API Extension
    ```sh
    burpctl start
    ```
    
3. Crawl the application by running
    ```sh
    burpctl crawl
    ```

4. Optionally run UI tests or an UI crawler (e.g., puppeteer tests using Burp as a proxy).

5. Actively scan the application by running
    ```sh
    burpctl scan
    ```

6. Generate a report with
    ```sh
    burpctl report
    ```

7. Shut down Burp Suite
    ```sh
    burpctl stop
    ```

[Burp Suite Professional]: https://portswigger.net/burp
[Burp REST API Extension]: https://github.com/vmware/burp-rest-api
[Node.js]: https://nodejs.org/en/
[Jenkins]: https://jenkins.io/


