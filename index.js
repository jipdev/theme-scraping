const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const TMP_FOLDER = 'tmp';

const createPageAndGoToTemplateUrl = async (template) => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(getAssetsUrl(template));
    const isError404 = await page.evaluate(() => {
        return !!document.querySelector('.error404');
    });
    if (isError404) throw new Error('Template not known!');
    return { browser, page };
};

const findOrCreateFolderTmp = () => {
    if (!fs.existsSync(`./${ TMP_FOLDER }`)) {
        fs.mkdirSync(TMP_FOLDER);
    }
};

(async () => {
    findOrCreateFolderTmp();
    const { page, browser } = await createPageAndGoToTemplateUrl(process.argv[2]);
    const hrefList = await page.evaluate(findAllHref);
    hrefList.shift();
    const obj = {};
    for (let href of hrefList) {
        const key = hrefToKey(href, 'assets');
        obj[key] = await createHrefObject(page, 'assets', href);
    }
    makeFolder('tmp/assets');
    await deepObjectNavigationAndWriteFileOrCreateFolder(page, obj, `${ TMP_FOLDER }/assets`);
    await browser.close();
})();

const getAssetsUrl = (template) => `http://primefaces.org/${ template }/assets/`;

const hrefToKey = (href, folderName) => href.split(`/${ folderName }/`)[1].replace('/', '').split('.')[0];

const findAllHref = () => {
    const elementNodeList = document.querySelectorAll('table tbody tr td a');
    return [ ...elementNodeList ].map(({ href }) => href);
};

const createHrefObject = async (page, folderName, href) => {
    let fileName = href.split(`/${ folderName }/`)[1];
    return isFolder(fileName) ? await deepCopy(page, removeEndSlash(fileName), href) : href;
};

const deepCopy = async (page, folderName, href) => {
    await page.goto(href);
    const hrefList = await page.evaluate(findAllHref);
    hrefList.shift();
    const obj = {};
    for (let href of hrefList) {
        const key = hrefToKey(href, folderName);
        obj[key] = await createHrefObject(page, folderName, href);
    }
    return obj;
};

const isFolder = (string) => {
    return string.endsWith('/');
};

const removeEndSlash = (string) => {
    return string.split('/')[0];
};

const getFileExtension = (href) => href.split('.').pop();

const deepObjectNavigationAndWriteFileOrCreateFolder = async (page, obj, previousPath) => {
    for (let key of Object.keys(obj)) {
        const value = obj[key];
        if (value instanceof Object) {
            const path = `${ previousPath }/${ key }`;
            makeFolder(path);
            await deepObjectNavigationAndWriteFileOrCreateFolder(page, value, path);
        } else {
            const extension = getFileExtension(value);
            const fileName = value.split('/').pop();
            switch (extension) {
                case 'scss':
                case 'css':
                case 'json':
                    const data = await navigateToUrlAndGetData(page, value);
                    fs.writeFileSync(`./${ previousPath }/${ fileName }`, Buffer.from(data));
                    break;
                case 'svg':
                case 'png':
                case 'jpg':
                case 'otf':
                case 'ttf':
                case 'woff':
                case 'woff2':
                    const response = await axios.get(value, {
                        responseType: 'stream'
                    });
                    response.data.pipe(fs.createWriteStream(`./${ previousPath }/${ fileName }`));
            }
        }
    }
};

const navigateToUrlAndGetData = async (page, href) => {
    await page.goto(href);
    return await page.evaluate(() => {
        const element = document.querySelector('pre');
        return element.firstChild['data'];
    });
};

const makeFolder = (name) => {
    if (fs.existsSync(name)) {
        fs.rmdirSync(name, { recursive: true });
    }

    fs.mkdirSync(name);
};
