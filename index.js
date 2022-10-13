const {Builder, By} = require('selenium-webdriver')
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
// (async () => {
//     try {
//         const tikTokData = await base('Social_Profiles').select({
//             filterByFormula: '{Platform} = "TikTok"',
//             maxRecords: 10
//         }).all()
//         await updateAirtable('TikTok', tikTokData)
//     } catch (e) {
//         console.log(e.name)
//     }
//     try {
//         const youtubeData = await base('Social_Profiles').select({
//             filterByFormula: '{Platform} = "YouTube"',
//             maxRecords: 10
//         }).all()
//         await updateAirtable('YouTube', youtubeData)
//     } catch (e) {
//         console.log(e)
//     }
//     try {
//         const twitterData = await base('Social_Profiles').select({
//             filterByFormula: '{Platform} = "Twitter"',
//             maxRecords: 10
//         }).all()
//         await updateAirtable('Twitter', twitterData)
//     } catch (e) {
//         console.log(e)
//     }
// })();

(async () => {
    const data = await scrapeAverageViewsTikTok('https://www.tiktok.com/@fredziownik_art')
    console.table(data)
    // await computeAverageViews()
})();

async function scrapeAverageViewsTikTok(url) {
    let serviceBuilder = new chrome.ServiceBuilder(process.env.CHROME_DRIVER_PATH)
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(serviceBuilder).build()
    await driver.manage().setTimeouts({implicit: 1000});
    console.time()
    const data = []
    try {
        const videoLinks = []
        // Get the creator main page
        await driver.get(url)
        // scrape the videos gird of the main page
        const videosGrid = await driver.findElement(By.css("div[mode='compact']"))
        const videos = await videosGrid.findElements(By.xpath('div'))
        // loop over the scraped videos and scrape the Views count and the video link, save them into an array of objects.
        if (videos.length > 0) {
            for (let video of videos) {
                const href = (await (await video.findElement(By.xpath(`div[1]/div/div/a`))).getAttribute('href'))
                const videoViews = (await (await video.findElement(By.css(`strong[data-e2e='video-views']`))).getAttribute('innerText'))
                videoLinks.push({
                    link: href,
                    views: videoViews
                })
            }
            // Loop through array of videos, open each video link, scrape the needed data
            for (let [counter, video] of videoLinks.entries()) {
                await driver.get(video.link)
                const likesCount = (await (await driver.findElement(By.css("strong[data-e2e='like-count']"))).getAttribute('innerText'))
                const commentCounts = (await (await driver.findElement(By.css("strong[data-e2e='comment-count']"))).getAttribute('innerText'))
                const shareCounts = (await (await driver.findElement(By.css("strong[data-e2e='share-count']"))).getAttribute('innerText'))
                const videoDate = (await (await (await driver.findElement(By.css("span[data-e2e='browser-nickname']"))).findElement(By.xpath('span[2]'))).getAttribute('innerText'))
                const videoCaption = (await (await driver.findElement(By.css("div[data-e2e='browse-video-desc']"))).getAttribute('innerText'))
                let isPaid
                // Check if the video is Paid Partnership by locating the element.
                try {
                    isPaid = (await (await driver.findElement(By.xpath("//p[text()='Paid partnership']"))).getAttribute('innerText'))
                } catch (e) {
                    // Look for the keyword ad when the paid partnership is not found
                    videoCaption.includes('#ad') ? isPaid = 'ad' : isPaid = 'not promo'
                }
                data.push({
                    views: video.views,
                    likes: likesCount,
                    comments: commentCounts,
                    shares: shareCounts,
                    date: videoDate,
                    //caption: videoCaption,
                    paid: isPaid
                })
                if (counter === 15)
                    break
            }
        }
    } catch (e) {
        console.log(e.message)
    } finally {
        // Quite the driver and calculate the execution time.
        await driver.quit()
        console.timeEnd()

    }
    return data
}

async function scrape(platform, record) {
    let serviceBuilder = new chrome.ServiceBuilder(process.env.CHROME_DRIVER_PATH)
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(serviceBuilder).build()
    await driver.manage().setTimeouts({implicit: 3000});
    const results = {}
    try {
        let followers, pic
        const url = record.Profile.includes('www') ? record.Profile : `https://www.${record.Profile}`
        await driver.get(url)
        switch (platform) {
            case 'TikTok':
                followers = await driver.findElement(By.css('strong[title= "Followers"]'))
                pic = await driver.findElement(By.xpath('//*[@id="app"]/div[2]/div[2]/div/div[1]/div[1]/div[1]/span/img'))
                break
            case 'YouTube':
                let tmpPfpYoutube = await driver.findElement(By.id('channel-header-container'))
                followers = await driver.findElement(By.id('subscriber-count'))
                pic = await tmpPfpYoutube.findElement(By.tagName('img'))
                break
            case 'Twitter':
                try {
                    await driver.findElement(By.xpath('//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div/div/div[2]/div/div/div[2]/div/div[3]')).click()
                } catch (e) {

                }
                try {
                    followers = await (await driver.findElement(By.xpath(`//a[contains(@href,'/${record.Name.charAt(0).toLowerCase() + record.Name.slice(1)}/followers')]`))).findElement(By.tagName('span'))
                    await driver.findElement(By.xpath(`//a[contains(@href,'/${record.Name.charAt(0).toLowerCase() + record.Name.slice(1)}/photo')]`)).click()
                    pic = await driver.findElement(By.xpath('//*[@id="layers"]/div[2]/div/div/div/div/div/div[2]/div[2]/div[1]/div/div/div/div/div/img'))
                } catch (e) {
                    followers = await (await driver.findElement(By.xpath(`//a[contains(@href,'/${record.Name.charAt(0).toUpperCase() + record.Name.slice(1)}/followers')]`))).findElement(By.tagName('span'))
                    await driver.findElement(By.xpath(`//a[contains(@href,'/${record.Name.charAt(0).toUpperCase() + record.Name.slice(1)}/photo')]`)).click()
                    pic = await driver.findElement(By.xpath('//*[@id="layers"]/div[2]/div/div/div/div/div/div[2]/div[2]/div[1]/div/div/div/div/div/img'))
                }
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

async function updateAirtable(platform, data) {
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
    const updatedRows = await updateRecords('Social_Profiles', updatedRecords)
    console.log(`Total number of updated rows on airtable: ${updatedRows}`)
    console.log(`Execution time: ${(Date.now() - start) / 1000}S`);
}

async function updateRecords(tableName, data) {
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