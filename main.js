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
const initial = "\x1b[0m%s";
const orange = "\x1b[33m%s\x1b[0m";

const defaultQuality = 90;
const defaultHeight = 768;
const defaultWidth = 1025;
const defaultDelay = 500;

//Paramétrage des options
const argv = require('yargs')
    .usage('\nUsage: slide2PDF --url <your_url> [options]\n or \n slide2PDF --config <configFile.json> [options]')
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
 * @function
 * @param {string} pageContent - HTML code of the curent page
 * @param {string} className - The class we want to test
 * @return {boolean} - true if className is present in the page, false otherwise
 */
function containsClass(pageContent, className) {
    let pageParsed = HTMLParser.parse(pageContent).querySelector(className);
    return (pageParsed != null);
}


/**
 * Function to know if the element is a defined number or not.
 * @function
 * @param {element} element - Keyboard input made by the user.
 * @return {boolean} - true if element is an integer, false otherwise
 */
function isInt(element) {
    return (((typeof element) === "number") && element != ("undefined" && "NaN"));
}

/**
 * Function to know if the element is an integer corresponding to a valid quality of the rendered PDF.
 * @function
 * @param {element} commandLineValue - Keyboard input made by the user via command line interface.
 * @param {element} configFileValue - Keyboard input made by the user via configuration file.
 * @return {int} - One of the input value if it's a correct one, default one otherwise
 */
function isQuality(commandLineValue, configFileValue) {
    let isQua = (commandLineValue <= 100) && (commandLineValue >= 0) && isInt(commandLineValue);
    let isQua2 = (configFileValue <= 100) && (configFileValue >= 0) && isInt(configFileValue);
    if (isQua) {
        return commandLineValue;
    } else {
        if (isQua2) {
            return configFileValue;
        } else {
            assert(true, orange, "\nInvalid typed photo quality, using default :" + defaultQuality + ".");
            return defaultQuality;
        }
    }
}


/**
 * Function to know if the element is an integer corresponding to valid values for the rendered PDF parameters.
 * @function
 * @param {element} commandLineValue - Keyboard input made by the user via command line.
 * @param {element} configFileValue - Keyboard input made by the user in the configuration file. 
 * @param {string} type - Describing if it concerns Width (type='w'), Height(type='h') or Animation delay (type='d')
 * @return {boolean} - Input parameter if it's a valid one. Default value otherwise.
 */
function isValidValue(commandLineValue, configFileValue, type) {
    let isDim = (commandLineValue >= 0) && (isInt(commandLineValue));
    let isDim2 = (configFileValue >= 0) && (isInt(configFileValue));
    if (isDim) {
        return commandLineValue
    } else {
        if (isDim2) {
            return configFileValue
        } else {
            if (type == "h") {
                assert(true, orange, "\nTyped height value: Invalid or not found, using default :" + defaultHeight + ".");
                return defaultHeight;
            } else {
                if (type == "w") {
                    assert(true, orange, "\nTyped width value: Invalid or not found, using default : " + defaultWidth + ".");
                    return defaultWidth;
                } else {
                    assert(true, orange, "\nTyped animation delay value: Invalid or not found, using default : " + defaultDelay + "ms .");
                    return defaultDelay;
                }

            }
        }
    }
}

/**
 * Function to know if the given name to the rendered PDF already exists for the given path.
 * @function
 * @param {string} absPath - Keyboard input made by the user to describe path for the rendered file.
 * @param {string} name - Name for the rendered file. 
 * @param {boolean} overwrite - Boolean describing if user wants the file to be overwritten or not.
 * @return {string} - The same 'name' or stop execution if overwriting is not accepted
 */
function verifyName(absPath, name, overwrite) {
    if (fs.existsSync(path.join(absPath, name) + ".pdf") && (!overwrite)) {
        const fileAlreadyExists = new Error("\n" + name + ".pdf already exists. If you want to overwrite it, please use -o option.\nType toPDF --help for more help.\n");
        console.error(fileAlreadyExists.message);
        process.exit(1);
    }
    return (name);
}

/**
 * Function that gives the number of the screenshot at the choosen format.
 * @function
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
 * Function to disable animations and transitions so that screenshot of the page can be made.
 * @function
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
 * Function to pause program execution
 * @function
 * @param {int} ms - Time that the program has to be paused in milisecond
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects if navigationList 's format is valid
 * @function
 * @param {object} navigationList - List of navigation selector/actions selected by user
 * @returns {boolean} - True if the list has valid format, false otherwise 
 */
function validNavigate(navigationList) {
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
 * Function to select to move to do to navigate towards the next slide.
 * @function
 * @param {string} pageContent - The current page content, in html considered as a string.
 * @return {string} - string describing the move to do to access next slide . 
 */
function nextslide(pageContent) {
    try {
        navigationList = config.get().navigate;
    } catch {
        navigationList = undefined;
    }
    let isDefault = validNavigate(navigationList)
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
 * Function to delede the temporary file named 'tmp' containing all screenshots registered in png format.
 * @function
 */
function deleteTmp(tempDir) {
    rimraf(tempDir, function () {});
}



/**
 * Imitates console.assert() behavior, without the error message.
 * @function
 * @param {boolean} condition - describes if the message has to be shown, or not. 
 * @param {string} message - message to show to user
 */
function assert(condition, color, message) {
    if (condition) {
        console.log(color, message);
    }
}

/**
 * Detects whether current slide is the last slide -- for Landslide slides 
 * @function
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @returns {boolean} true if the current slide is the last one, false otherwise
 */
function endLandslide(pageContent, end) {
    if (!end) {
        end = !(containsClass(pageContent, ".slide.far-future") || containsClass(pageContent, ".slide.future"));
    }
    return end;
}


/**
 * Detects whether current slide is the last slide -- for Reveal slides 
 * @function
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @returns {boolean} true if the current slide is the last one, false otherwise
 */
function endReveal(pageContent, end) {
    if (!end) {
        end = (!containsClass(pageContent, ".future") && !containsClass(pageContent, ".navigate-right.enabled") && !containsClass(pageContent, ".navigate-down.enabled"));
    }
    return end;
}

/**
 * Transforms operator from litteral to usable logical operator
 * @function
 * @param {string} operator - Litteral operator selected by user ( might be 'and' or 'or')
 * @returns {string} - Operator formated so it can be used in an "eval". This string is either "&&" or "||"
 */
function getOperator(operator) {
    if (operator == "and") {
        return "&&";
    } else {
        return "||";
    }
}

/**
 * Detects whether current slide is the last slide -- for both Landslides & Reveal slides 
 * @function
 * @param {string} pageContent - Content of current page/slide in html format
 * @param {boolean} end - boolean describing if the slide is the last slide
 * @returns {boolean} true if the current slide is the last one, false otherwise
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
            return (endReveal(pageContent, end) && endLandslide(pageContent, end));
        } else {
            return end;
        }
    }
}

/**
 * Detects whether the typed URL is in the right format 
 * @function
 * @param {string} url - Url selected by the user (via LCI or configuration file)
 * @returns {string} - Correct URL or quit 
 */
function validUrl(url) {
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
            assert(true, red, "\nNo URL found. Please insert URL in config file or type it when lauching the app with --url .\n Try slide2PDF --help for more help");
            process.exit(-1);
        }
    }
}

/**
 * Detects whether the typed path is in the right format 
 * @function
 * @param {string} typedPath - path selected by the user (via CLI or configuration file)
 * @returns {string} - Correct path/file name or default path + name that is : ./out.pdf 
 */
function verifyPath(typedPath) {
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
if (fs.existsSync(argv.config)) {
    config.load(argv.config);
    url = validUrl(argv.url);
    overwrite = argv.overwrite ||  (argv.overwrite && config.get().overwrite);
    height = isValidValue(argv.h, config.get().height, 'h');
    width = isValidValue(argv.w, config.get().width, 'w');
    animationDelay = isValidValue(argv.delay, config.get().animationDelay, 'd');
    quality = isQuality(argv.q, config.get().pictureQuality);
    verbose = (argv.v ||  config.get().verbose);
    debug = config.get().debug ||  argv.d;
} else {
    console.log("\nNo config file found, using default configuration");
    url = validUrl(argv.url);
    overwrite = argv.overwrite;
    height = isValidValue(argv.h, "", 'h');
    width = isValidValue(argv.w, "", 'w');
    animationDelay = isValidValue(argv.delay, "", 'd');
    quality = isQuality(argv.q, "");
    verbose = argv.v;
    debug =  argv.d;
}

const typedPath = verifyPath(argv.o);
const targetPath = path.resolve(process.cwd(), typedPath);
const absPath = path.parse(targetPath).dir;
const newName = verifyName(path.parse(targetPath).dir, path.parse(typedPath).name, overwrite);
const format = "png";


let end = false;

(async () => {
    const tempDir = mktemp.createDirSync('/tmp/toPDF-XXXX');;

    try {
        await assert(verbose, bold, "\nLaunching browser:");
        const browser = await puppeteer.launch();
        await assert(verbose, green, " Done");

        await assert(verbose, bold, "\nOpening a new page:");
        const page = await browser.newPage();
        await assert(verbose, green, " Done\n");

        await page.setViewport({
            width: width,
            height: height
        });

        let i = 1;

        await assert(verbose, bold, "Accessing URL:");
        try {
            await page.goto(url);
            assert(verbose, green, " Done");
        } catch (error) {
            console.error(red, "An error occurred while trying to access to URL : ");
            assert(!debug, initial, error + "\n");
            assert(debug, initial, error);
            await deleteTmp(tempDir);
        }

        let pageContent = await page.content();
        end = isEnd(pageContent, end);

        await assert(verbose, bold, '\nStarting taking screenshot:\n');

        await stopAnimation(page);
        await sleep(3000);
        await page.screenshot({
            path: tempDir + '/' + padToThree(i) + '.' + format,
            type: format,
        });

        await process.stdout.write('.');
        try {
            while (!end) {
                await i++;
                await process.stdout.write('.');

                pageContent = await page.content();
                end = isEnd(pageContent, end);

                if (!end) {
                    next = await nextslide(pageContent);
                    await page.keyboard.press(next);
                    await sleep(animationDelay);
                    await stopAnimation(page);
                    await page.screenshot({
                        path: tempDir + '/' + padToThree(i) + '.' + format,
                        type: format,
                    });
                }
            };
        } catch (error) {
            console.log(red, "\n\nSelected stopping or navigate condition(s) seem(s) to be incorrect, throws: ");
            assert(!debug, initial, error + "\n");
            assert(debug, initial, error);
        }

        await assert(verbose, bold, '\n\nConverting screenshot to PDF : (May take a while)');
        await easyimg.convert({
            src: tempDir + '/*.' + format,
            dst: path.join(absPath, newName) + '.pdf',
            quality: quality
        }, function () {
            assert(verbose, green, ' Done');
        });
        console.log('\x1b[36m%s\x1b[0m', '\nThe rendered file is available here : ' + path.join(absPath, newName) + '.pdf\n\n');
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