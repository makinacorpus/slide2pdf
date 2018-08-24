#!/usr/bin/env node

const puppeteer = require('puppeteer');
const rimraf = require('rimraf');
const fs = require('fs-extra');
const easyimg = require('easyimage');
const path = require('path');
const mktemp = require('mktemp');
const config = require('config-json');
const HTMLParser = require('node-html-parser');
const KeyValEnum = Object.freeze({
    "SELECTOR": 0,
    "ACTION": 1
});

const green = "\x1b[32m%s\x1b[0m";
const bold = "\x1b[1m%s\x1b[0m";
const red = "\x1b[31m%s\x1b[0m";
const blue = "\x1b[36m%s\x1b[0m";
const initial = "\x1b[0m%s";
const orange = "\x1b[33m%s\x1b[0m";

const defaultQuality = 90;
const defaultHeight = 768;
const defaultWidth = 1025;
const defaultAnimationDelay = 500;


const argv = require('yargs')
    .usage('\nUsage: slide2pdf --url <your_url> [options]\n or \n slide2pdf --config <configFile.json> [options]')
    .option('u', {
        alias: 'url',
        describe: 'URL of the original slides',
        type: 'string',
        nargs: 1
    })
    .option('q', {
        alias: 'picturequality',
        describe: 'Quality of the rendered PDF',
        type: 'number',
    })
    .option('w', {
        alias: 'width',
        describe: "Width of the rendered PDF ",
        type: 'number',
    })
    .option('h', {
        alias: 'height',
        describe: "Height of the rendered PDF",
        type: 'number',
    })
    .option('o', {
        alias: 'outputpath',
        describe: "Path and name to save the rendered PDF",
        type: 'string',
    })
    .option('v', {
        describe: 'Verbose mode to detail execution',
        type: 'boolean',
        default: false
    })
    .option('overwrite', {
        describe: 'To force overwriting chosen file',
        type: 'boolean',
        default: false
    })
    .option('d', {
        alias: 'debug',
        describe: 'To display complementary information when bug occurs',
        type: 'boolean',
        default: false
    })
    .option('config', {
        describe: 'Path to configuration file.',
        type: 'string',
        default: './config.json'
    })
    .option('delay', {
        describe: 'Delay needed to skip animations',
        type: 'number'
    })
    .argv;

/**
 * Detects if a class is contained in parsed HTML page.
 * @param {string} pageContent - HTML code of the curent page
 * @param {string} className - The class we want to test
 * @return {boolean} - true if className is present in the page, false otherwise
 */
function containsClass(pageContent, className) {
    let pageParsed = HTMLParser.parse(pageContent).querySelector(className);
    return (pageParsed != null);
}


/**
 * Detects if the element is a defined integer or not.
 * 
 * @param {element} element - Keyboard input made by the user.
 * @return {boolean} - true if element is an integer, false otherwise
 */
function isInt(element) {
    return (((typeof element) === "number") && element != ("undefined" && "NaN"));
}

/**
 * Gets a valid picture quality 
 * 
 * @param {element} commandLineValue - Picture quality value from command line interface.
 * @param {element} configFileValue -  Picture quality value from configuration file.
 * @return {int} - Valid picture quality ; either command line one, or the one from configuration file or default one.
 */
function getPictureQuality(commandLineValue, configFileValue) {
    let commandLineQuality = (commandLineValue <= 100) && (commandLineValue >= 0) && isInt(commandLineValue);
    let configFileValueQuality = (configFileValue <= 100) && (configFileValue >= 0) && isInt(configFileValue);
    if (commandLineQuality) {
        return commandLineValue;
    } else {
        if (configFileValueQuality) {
            return configFileValue;
        } else {
            assert(true, orange, "\nInvalid value for picture quality, using default :" + defaultQuality + ".");
            return defaultQuality;
        }
    }
}


/**
 * Gets valid values for parameters that are integers.
 * 
 * @param {element} commandLineValue - Value from command line interface.
 * @param {element} configFileValue - Value from configuration file.
 * @param {string} name - Describing if it concerns Width (name='w'), Height(name='h') or Animation delay (name='d')
 * @return {boolean} - Input parameter if it's a valid one. Default value otherwise.
 */
function getIntParameters(commandLineValue, configFileValue, name) {
    let isCommandLineValueValid = (commandLineValue >= 0) && (isInt(commandLineValue));
    let isConfigFileValueValid = (configFileValue >= 0) && (isInt(configFileValue));
    if (isCommandLineValueValid) {
        return commandLineValue
    } else if (isConfigFileValueValid) {
        return configFileValue
    } else {
        switch (name) {
            case "h":
                assert(true, orange, "\nHeight value: Invalid or not found, using default :" + defaultHeight + ".");
                return defaultHeight;
            case "w":
                assert(true, orange, "\nWidth value: Invalid or not found, using default : " + defaultWidth + ".");
                return defaultWidth;
            case "d":
                assert(true, orange, "\nAnimation delay value: Invalid or not found, using default : " + defaultAnimationDelay + "ms .");
                return defaultAnimationDelay;
            default:
                break;
        }
    }
}


/**
 * Gets the given name to the rendered PDF by checking if it already exists for the given path.
 * 
 * @param {string} absPath - Path & name for the rendered file.
 * @param {string} name - Name for the rendered file. 
 * @param {boolean} overwrite - Boolean describing if user wants the file to be overwritten or not.
 * @return {string} - The same 'name' or stop execution if overwriting is not accepted
 */
function getName(absPath, name, overwrite) {
    if (fs.existsSync(path.join(absPath, name) + ".pdf") && (!overwrite)) {
        const fileAlreadyExists = new Error("\n" + name + ".pdf already exists. If you want to overwrite it, please use -o option.\nType toPDF --help for more help.\n");
        console.error(fileAlreadyExists.message);
        process.exit(1);
    }
    return (name);
}

/**
 * Creating name for screenshot file.
 * 
 * @param {int} number - number of the screenshot given by the iterator
 * @return {string} - string giving the number of the screenshot at the chosen format
 */
function padToThree(number) {
    if (number <= 999) {
        number = ("00" + number).slice(-3);
    }
    return number;
}

/**
 * Disables animations and transitions so that screenshot of the page can be done.
 * 
 * @param {page} page - The current page that has to be unanimated.
 * @return {page} - The unanimated page . 
 */
function stopAnimation(page) {
    page._client.send('Animation.disable');
    page._client.send('Animation.setPlaybackRate', {
        playbackRate: 320
    });
    return page;
}

/**
 * Pauses program execution
 * 
 * @param {int} ms - Time that the program has to be paused in milisecond
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects if navigationList's format is valid
 * 
 * @param {object} navigationList - List of navigation selectors/actions 
 * @return {boolean} - True if the list has valid format, false otherwise 
 */
function isNavigationListValid(navigationList) {
    if (navigationList != undefined) {
        let condition1 = navigationList.length >= 1;
        let condition2 = true;
        if (condition1) {
            for (let i = 0; i < navigationList.length - 1; i++) {
                condition2 = condition2 && navigationList[i].length == 2;
            }
        }
        assert(!(condition1 && condition2), red, "\nNavigate option's format is not valid. For more help, refer to README file.\n");
        return (condition1 && condition2);
    } else {
        return false;
    }
}


/**
 * Selects the action key code to navigate towards the next slide.
 * 
 * @param {string} pageContent - The current page content, in html considered as a string.
 * @return {string} - key code to access next slide . 
 */
function nextslide(pageContent) {
    try {
        navigationList = config.get().navigate;
    } catch {
        navigationList = undefined;
    }
    let isDefault = isNavigationListValid(navigationList)
    if (!isDefault) {
        actionKey = 'ArrowRight';
        if (containsClass(pageContent, "navigate-down enabled")) {
            actionKey = 'ArrowDown';
        }
        return actionKey;
    } else {
        actionKey = "";
        let i = 0;
        let listLength = navigationList.length;
        while ((actionKey == "") && (i < listLength)) {

            let selector = navigationList[i][KeyValEnum.SELECTOR];
            if (containsClass(pageContent, selector)) {
                actionKey = navigationList[i][KeyValEnum.ACTION];
            }
            ++i;
        };
        if (actionKey == "") {
            actionKey = "ArrowRight";
        }
        return actionKey;
    }
}

/**
 * Deletes the temporary directory named 'tmp' containing all screenshots registered in png format.
 * 
 */
function deleteTmp(tempDir) {
    rimraf(tempDir, function () {});
}



/**
 * Imitates console.assert() behavior, without the error message.
 * 
 * @param {boolean} condition - describes if the message has to be shown, or not. 
 * @param {string} color - Color that has to be shown for the message  
 * @param {string} message - message to show to user
 */
function assert(condition, color, message) {
    if (condition) {
        console.log(color, message);
    }
}

/**
 * Detects whether current slide is the last slide -- for Landslide slides 
 * 
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @return {boolean} true if the current slide is the last one, false otherwise
 */
function isEndLandslide(pageContent, end) {
    if (!end) {
        end = !(containsClass(pageContent, ".slide.far-future") || containsClass(pageContent, ".slide.future"));
    }
    return end;
}


/**
 * Detects whether current slide is the last slide -- for Reveal slides 
 * 
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @return {boolean} true if the current slide is the last one, false otherwise
 */
function isEndReveal(pageContent, end) {
    if (!end) {
        end = (!containsClass(pageContent, ".future") && !containsClass(pageContent, ".navigate-right.enabled") && !containsClass(pageContent, ".navigate-down.enabled"));
    }
    return end;
}

/**
 * Transforms operator from litteral to usable logical operator
 * 
 * @param {string} operator - Litteral operator selected by user ( might be 'and' or 'or')
 * @return {string} - Operator formated so it can be used in an "eval". This string is either "&&" or "||"
 */
function getOperator(operator) {
    if (operator == "and") {
        return "&&";
    } else {
        return "||";
    }
}

/**
 * Detects whether current slide is the last slide 
 * 
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @return {boolean} true if the current slide is the last one, false otherwise
 */
function isEnd(pageContent, end) {
    try {
        endCaseObj = config.get().endCase;
    } catch {
        endCaseObj = undefined;
    }

    if (endCaseObj !== undefined && (!end)) {
        let res = false;
        let operatorObject = getOperator(endCaseObj.operator);
        let resTmp = !eval((true + operatorObject + false));
        for (let j = 0; j < endCaseObj.queries.length; j++) {
            let request = containsClass(pageContent, endCaseObj.queries[j]);
            if (endCaseObj.reverse) {
                resTmp = eval(resTmp + operatorObject + (!request));
            } else {
                resTmp = eval(resTmp + operatorObject + (request));
            }
        }
        res = (resTmp || res);
        return res;
    } else {
        if (!end) {
            return (isEndReveal(pageContent, end) && isEndLandslide(pageContent, end));
        } else {
            return end;
        }
    }
}

/**
 * Detects whether input URL is in the right format 
 * 
 * @param {string} url - Targeted URL
 * @return {string} - Correct URL or quit 
 */
function isUrlValid(url) {
    try {
        configURL = config.get().url;
    } catch {
        configURL = undefined;
    }

    if ((url == undefined) && (configURL != undefined)) {
        return configURL;
    } else {
        if (url != undefined) {
            return url;
        } else {
            assert(true, red, "\nNo URL found. Please insert URL in config file or type it when lauching the app with --url .\n Try slide2pdf --help for more help");
            process.exit(-1);
        }
    }
}

/**
 * Detects whether input path is in the right format 
 * 
 * @param {string} typedPath - path selected by the user (via CLI or configuration file)
 * @return {string} - Correct path/file name or default path + name that is : ./out.pdf 
 */
function isPathValid(typedPath) {
    try {
        configPath = config.get().outputPath;

    } catch (error) {
        configPath = undefined;
    }
    if (typedPath != undefined) {
        return typedPath;
    } else {
        if (configPath != undefined) {
            return configPath;
        } else {
            assert(true, orange, '\nNo path/name specified for the rendered file. Default will be used : "./out.pdf" ');
            return "./out.pdf";
        }
    }
}




/**********************************
 *
 * Main function starts here. 
 *  
 **********************************/


if (fs.existsSync(argv.config)) {
    config.load(argv.config);
    url = isUrlValid(argv.url);
    overwrite = argv.overwrite ||  (argv.overwrite && config.get().overwrite);
    height = getIntParameters(argv.h, config.get().height, 'h');
    width = getIntParameters(argv.w, config.get().width, 'w');
    animationDelay = getIntParameters(argv.delay, config.get().animationDelay, 'd');
    quality = getPictureQuality(argv.q, config.get().pictureQuality);
    verbose = (argv.v ||  config.get().verbose);
    debug = config.get().debug ||  argv.d;
} else {
    console.log("\nNo config file found, using default configuration");
    url = isUrlValid(argv.url);
    overwrite = argv.overwrite;
    height = getIntParameters(argv.h, "", 'h');
    width = getIntParameters(argv.w, "", 'w');
    animationDelay = getIntParameters(argv.delay, "", 'd');
    quality = getPictureQuality(argv.q, "");
    verbose = argv.v;
    debug =  argv.d;
}

const typedPath = isPathValid(argv.o);
const targetPath = path.resolve(process.cwd(), typedPath);
const absPath = path.parse(targetPath).dir;
const newName = getName(path.parse(targetPath).dir, path.parse(typedPath).name, overwrite);
const format = "png";


let end = false;

(async () => {
    const tempDir = mktemp.createDirSync('/tmp/toPDF-XXXX');

    try {
        assert(verbose, bold, "\nLaunching browser:");
        const browser = await puppeteer.launch();
        assert(verbose, green, " Done");

        assert(verbose, bold, "\nOpening a new page:");
        const page = await browser.newPage();
        assert(verbose, green, " Done\n");

        await page.setViewport({
            width: width,
            height: height
        });

        let i = 1;

        assert(verbose, bold, "Accessing URL:");
        try {
            await page.goto(url);
            assert(verbose, green, " Done");
        } catch (error) {
            console.error(red, "An error occurred while trying to access to URL : ");
            assert(!debug, initial, error + "\n");
            deleteTmp(tempDir);
        }

        let pageContent = await page.content();
        end = isEnd(pageContent, end);

        assert(verbose, bold, '\nStarting taking screenshot:\n');

        stopAnimation(page);
        sleep(animationDelay);
        await page.screenshot({
            path: tempDir + '/' + padToThree(i) + '.' + format,
            type: format,
        });

        process.stdout.write('.');
        try {
            while (!end) {
                i++;
                process.stdout.write('.');

                pageContent = await page.content();
                end = isEnd(pageContent, end);

                if (!end) {
                    next = nextslide(pageContent);
                    await page.keyboard.press(next);
                    sleep(animationDelay);
                    stopAnimation(page);
                    await page.screenshot({
                        path: tempDir + '/' + padToThree(i) + '.' + format,
                        type: format,
                    });
                }
            };
        } catch (error) {
            console.log(red, "\n\nSelected stopping or navigate condition(s) seem(s) to be incorrect, throws: ");
            assert(debug, initial, error);
        }

       assert(verbose, bold, '\n\nConverting screenshot to PDF : (May take a while)');
        await easyimg.convert({
            src: tempDir + '/*.' + format,
            dst: path.join(absPath, newName) + '.pdf',
            quality: quality
        }, function () {
            assert(verbose, green, ' Done');
        });
        console.log(blue, '\nThe rendered file is available here : ' + path.join(absPath, newName) + '.pdf\n\n');
        await deleteTmp(tempDir);
        await browser.close();
    } catch (error) {
        console.error(red, "\nSomething went wrong during execution. Please ensure you typed valid options :\n" + error + "\nTry again ");
        assert(debug, initial, error);
        try {
            await deleteTmp(tempDir);
            await browser.close();
        } catch (error) {
            process.exit(-1);
        }
    }
})();