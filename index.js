const {Builder, By, until} = require('selenium-webdriver')
const chrome = require("selenium-webdriver/chrome")
const Airtable = require('airtable')

// Initialize Selenium
const screen = {
    width: 1920,
    height: 1080
}
const options = new chrome.Options()
options.setChromeBinaryPath(process.env.CHROME_BINARY_PATH)
options.addArguments("--headless")
options.addArguments("--disable-gpu")
options.addArguments("--no-sandbox")
options.addArguments("--disable-dev-shm-usage")
options.windowSize(screen)

// Initialize Airtable
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_API_KEY
})
const base = Airtable.base("app0uHEtrxyWp3uzn");

// Main function
(async () => {
    // try {
    //     const tikTokData = await base('Social_Profiles').select({
    //         filterByFormula: '{Platform} = "TikTok"'
    //     }).all()
    //     await updateAirtableTikTok('TikTok', tikTokData)
    // } catch (e) {
    //     console.log(e.name)
    // }
    // try {
    //     const instagramData = await base('Social_Profiles').select({
    //         filterByFormula: '{Platform} = "Instagram"',
    //         maxRecords: 5
    //     }).all()
    //     await updateAirtableTikTok('Instagram', instagramData)
    // } catch (e) {
    //     console.log(e)
    // }
    // try {
    //     const instagramData = await base('Social_Profiles').select({
    //         filterByFormula: '{Platform} = "YouTube"'
    //     }).all()
    //     await updateAirtableTikTok('YouTube', instagramData)
    // } catch (e) {
    //     console.log(e)
    // }
    try {
        const twitterData = await base('Social_Profiles').select({
            filterByFormula: '{Platform} = "Twitter"'
        }).all()
        await updateAirtableTikTok('Twitter', twitterData)
    } catch (e) {
        console.log(e)
    }
})();

async function scrape(platform, record) {
    let serviceBuilder = new chrome.ServiceBuilder(process.env.CHROME_DRIVER_PATH)
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(serviceBuilder).build()
    await driver.manage().setTimeouts({implicit: 5000});
    const results = {}
    try {
        let followers, pic
        const url = record.Profile.includes('www') ? record.Profile : `https://www.${record.Profile}`
        await driver.get(url)
        if (platform === 'TikTok') {
            followers = await driver.findElement(By.css('strong[title= "Followers"]'))
            pic = await driver.findElement(By.xpath('//*[@id="app"]/div[2]/div[2]/div/div[1]/div[1]/div[1]/span/img'))
        } else if (platform === 'Instagram') {
            let tmpFollowers = await driver.findElement(By.xpath("//div[text()= ' followers']"))
            let tmpPfp = await driver.findElement(By.css("span[role='link']"))
            followers = await tmpFollowers.findElement(By.tagName('span'))
            pic = await tmpPfp.findElement(By.tagName(`img`))
        } else if (platform === 'YouTube') {
            let tmpPfp = await driver.findElement(By.id('channel-header-container'))
            followers = await driver.findElement(By.id('subscriber-count'))
            pic = await tmpPfp.findElement(By.tagName('img'))
        } else if (platform === 'Twitter') {
            try {
                await driver.findElement(By.xpath('//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div/div/div[2]/div/div/div[2]/div/div[3]')).click()
            } catch (e) {

            }
            followers = await driver.findElement(By.xpath('//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div/div/div[2]/div/div/div/div/div[5]/div[2]/a/span[1]/span'))
            await driver.findElement(By.xpath('//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div/div/div[2]/div/div/div/div/div[1]/div[1]/div[2]/div/div[2]/div/a/div[4]/div')).click()
            pic = await driver.findElement(By.xpath('//*[@id="layers"]/div[2]/div/div/div/div/div/div[2]/div[2]/div[1]/div/div/div/div/div/img'))
        }
        results['Followers'] = await followers.getText()
        results['Followers'] = results['Followers'].replace("subscribers", '')
        results['Social_Media_Profile_Picture'] = await pic.getAttribute('src')
        return results
    } catch (e) {
        console.log(e)
        results['error'] = 'error'
        return results
    } finally {
        await driver.quit()
    }
}

async function updateAirtableTikTok(platform, data) {
    const start = Date.now()
    const records = data.map(record => ({id: record.id, fields: record.fields}))
    console.log(`Total number of rows are being scraped: ${records.length}`)
    const error = []
    let index = 1
    for (let record of records) {
        const updatedRecord = {}
        const scrapedData = await scrape(platform, record.fields)
        if (!scrapedData.hasOwnProperty('error')) {
            updatedRecord.Followers = scrapedData.Followers
            updatedRecord['Social_Media_Profile_Picture'] = [{
                url: scrapedData.Social_Media_Profile_Picture,
                filename: record.Name
            }]
            console.log(`${index} ${record.fields.Name}`)
            record.fields = updatedRecord
            index++
        } else error.push(record)
    }
    const updatedRecords = records.filter(item => !item.fields.hasOwnProperty('Name'))
    console.log('-----------------------------------------')
    console.log(`Creators with inactive ${platform} profile: ${error.length}`)
    error.forEach(record => console.log(record.fields.Name))
    if (error.length > 0) {
        await addInactiveToList("Saved_Lists", {
            "fields": {
                List_Name: `Inactive ${platform} Accounts`,
                Creators: error.map(record => record.fields.Creator_Record_id[0])
            }
        })
    }
    console.log('-----------------------------------------')
    const updatedRows = await airtableUpdate('Social_Profiles', updatedRecords)
    console.log(`Total number of updated rows on airtable: ${updatedRows}`)
    console.log(`Execution time: ${(Date.now() - start) / 1000}S`);
}

async function airtableUpdate(tableName, data) {
    let startIndex = 0
    let i = data.length >= 10 ? 10 : 0
    let counter = 0
    let rowsNumber = 0
    const arrayRepetition = (data.length / 10).toString().split('.')
    for (i; parseInt(arrayRepetition[0]) > counter; i += 10) {
        await base(`${tableName}`).update(data.slice(startIndex, i), (err, records) => {
            if (err) {
                console.error(err)
            }
        })
        startIndex = i
        counter++
        rowsNumber += 10
    }
    if (parseInt(arrayRepetition[1]) > 0)
        await base(`${tableName}`).update(data.slice(startIndex), (err, records) => {
            if (err)
                console.error(err)
        })
    rowsNumber += data.slice(startIndex).length
    return rowsNumber
}

async function addInactiveToList(tableName, data) {
    await base(tableName).create([data], (err, records) => {
        if (err)
            console.error(err)
    })
}