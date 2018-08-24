# slide2pdf
slide2pdf is made to convert WEB presentation slides to PDF by capturing screenshots and converting it to PDF format.


## System requirements

  - ImageMagick needs to be installed on your machine (version 6.8.9-9 or greater)
  - Slides need to be online or in a file on your machine

##  Other requirements 

  - Slides given to slide2pdf can't be in PDF format. 
  - If slides are locally saved , ensure the URL given to slide2pdf is in a valid format : 
    - example : 
```sh
file:///home/myDir/presentation.html#slide1
```

## Installation
Once you've installed ImageMagick, install the module slide2pdf : 
```sh
$ npm install -g slide2pdf
```
You can now use it from any workspace. 
## Usage 
There are two ways to configure app's options. 
Running the app with no config.json file will launch ReavealJS / Landslide conversion from given url. For instance : 
```
slide2pdf -u https://darekkay.github.io/presentations/accessible-web/index.html#/ -o test.pdf 
```
Both ways need at least one parameter : the url of the targeted slides.

### __Configuration file__: 
To use the configuration file method, you have to launch the application in the shell as follows : 
```sh
slide2pdf --config <path to the configuration file>
```
This file has to be a JSON file. 
The syntax of the configuration file has to be as follows : 
```sh
{
  "endCase": {
        "operator": "and",
        "reverse": true,
        "queries": [
            ".slide.future",
            ".slide.far-future"
        ]
    },  
  "navigate": [
        [".navigate-down.enabled", "ArrowDown"],
        [".navigate-right.enabled", "ArrowRight"]
  ],
  "colored": true,
  "pictureQuality": 90,
  "outputPath": "./out.pdf",
  "verbose": true,
  "overwrite": false,
  "debug": false,
  "width": 1020,
  "height": 760,
  "animationDelay": 500 ,
  "url": "https://darekkay.github.io/presentations/accessible-web/index.html#/"
}
```
__endCase__ is the option that allows you to choose stopping conditions. Those conditions are selectors that mark the end of the slide by their presence or absence. For instance, the html code of the last slide is characterized by the absence of the class "future"; that's the case that you can see in the example above. If endCase option is missing, stopping conditions for RevealJS and Landslide slides will be used. 
+ __operator__ : 
  + "and" if you want all queries wrote in queries part to be verified. 
  + "or" if you want at least one of the queries to be verified. 

+ __reverse__ : 
   + Must be true if the absence of querie selector is the sign of the end of the slide.
   + Must be false if the presence of querie selector is the sign of the end of the slide.

+ __queries__ : One or several selectors that must be present/absent to mark the end of the slide.

__navigate__ : 

Option where you specify how to navigate from one slide to another. For each case of navigation, you must fill the table with table of size 2. The first cell will contain the selector that lead to the movement expressed in the second cell. 
For instance, in the example above, each time the HTML code contains the class '.navigate-down.enabled' , the action 'press the arrow right' of the keyboard will be done. You can see the list of supported actions [here](https://github.com/GoogleChrome/puppeteer/blob/master/lib/USKeyboardLayout.js). 
The first navigation case specified will be have priority over next ones. Still on the same example, ArrowDown will have the priority over ArrowRight if both selectors are contained in the page. 
If navigate option is missing, default will be ArrowRight on each slide. 

__colored__ is the option allowing to see the app's proceeding information in color. Default is true.

__pictureQuality__ : Describes the quality of the screenshot of the slides. Default is 90. 


__outputPath__ : Relative or absolute path where the rendered PDF will be saved.
Default is "./out.pdf" 

__verbose__ : true if you want to see processing informations in the shell 

__overwrite__ : 
+ true if you want to overwrite the potential file that has the same name as __outputPath__
+ false otherwise 

Default is false. 

__debug__ : 
+ true if you want more information when a bug occurs .
+ false otherwise.

__width__ : interger representing the width of the screenshot of slides. Default is 1020. 

__height__ : integer reprensenting the height of the screenshot of slides. Default is 760.


__animationDelay__ : integer describing the time (millisecond) you want to wait between the moment that the page is loaded and the screenshot. Usefull if the slide contains animations. Default is 500.

__url__ : url of the slide that you want to convert. Required either in configuration file, or in command line when the app is launched.


### __Command line options__: 

A help is provided as so : 
```sh
Usage: slide2pdf --url <your_url> [options]
 or
 slide2pdf --config <configFile.json> [options]

Options:
  --help                Show help                                      [boolean]
  --version             Show version number                            [boolean]
  -u, --url             URL of the original slides                      [string]
  -q, --picturequality  Quality of the rendered PDF                     [number]
  -w, --width           Width of the rendered PDF                       [number]
  -h, --height          Height of the rendered PDF                      [number]
  -o, --outputpath      Path and name to save the rendered PDF          [string]
  -v                    Verbose mode to detail execution
                                                      [boolean] [default: false]
  --overwrite           To force overwriting chosen file
                                                      [boolean] [default: false]
  -d, --debug           To display complementary information when bug occurs
                                                      [boolean] [default: false]
  --config              Path to configuration file.
                                             [string] [default: "./config.json"]
  --delay               Delay needed to skip animations                 [number]
```

Command line options will have priority over configuration file. As an example, if you specified a different url in your config file than in command line, the url given in command line will be the targeted one. 



### Tech

slide2pdf uses a number of open source projects to work properly:
* [NodeJS](https://github.com/nodejs) - Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine (V7.6.0 or greater)
* [ImageMagick](https://doc.ubuntu-fr.org/imagemagick) 
* All packages listed in package.json file 