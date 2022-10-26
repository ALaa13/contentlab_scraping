const chrome = require("selenium-webdriver/chrome")
const {Builder, By, until} = require('selenium-webdriver')
const statistic = require('summary')
const {CHROME_BINARY_PATH, CHROME_DRIVER_PATH} = require('./index')
const Airtable = require('airtable')
//require("chromedriver")

// Initialize Airtable
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_API_KEY//'keyKOpl3rm3Q1r0MZ'
})
const base = Airtable.base("app0uHEtrxyWp3uzn")


// Helper Methods
const initiateDriver = () => {
    const screen = {
        width: 1920,
        height: 1080
    }
    const options = new chrome.Options()
    options.setChromeBinaryPath(CHROME_BINARY_PATH)
    options.addArguments("--headless")
    options.addArguments("--disable-gpu")
    options.addArguments("--no-sandbox")
    options.addArguments("--disable-dev-shm-usage")
    options.addArguments("--ignore-certificate-errors")
    options.addArguments("--allow-running-insecure-content")
    options.windowSize(screen)
    let serviceBuilder = new chrome.ServiceBuilder(CHROME_DRIVER_PATH)
    return new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(serviceBuilder).build()
}
// const initiateDriver = () => {
//     try {
//         const screen = {
//             width: 1920,
//             height: 1080
//         }
//         const options = new chrome.Options()
//         options.addArguments("--headless")
//         options.addArguments("--disable-gpu")
//         options.addArguments("--no-sandbox")
//         options.addArguments("--disable-dev-shm-usage")
//         options.addArguments("--ignore-certificate-errors")
//         options.addArguments("--allow-running-insecure-content")
//         options.windowSize(screen)
//         return new Builder().forBrowser('chrome').setChromeOptions(options).build()
//     } catch (e) {
//         console.log(e)
//     }
// }
const processNumbers = item => {
    let number = parseFloat(item.replace(/^\D+/g, ''))
    item.includes('M') ? number *= 1000000 : item.includes('K') ? number *= 1000 : number
    return !isNaN(number) ? number : 0
}
const toDate = string => {
    const mapping = {
        w: -7 * 24 * 60 * 60 * 1000,
        d: -24 * 60 * 60 * 1000,
        h: -60 * 60 * 1000,
    }

    const match = string.match(/(?<number>[0-9]*)(?<unit>[a-z]*)/)
    if (match) {
        const {number, unit} = match.groups
        const offset = number * mapping[unit]
        return new Date(Date.now() + offset)
    }
}
const checkDate = date => {
    const then = new Date(date)
    const now = new Date()
    const msBetweenDates = Math.abs(then.getTime() - now.getTime())
    const msToDays = Math.trunc(msBetweenDates / (24 * 60 * 60 * 1000))
    return msToDays > 3 && msToDays < 90
}
const getOutliers = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))

    const firstQuartile = views.quartile(0.25)
    const thirdQuartile = views.quartile(0.75)
    const iqr = thirdQuartile - firstQuartile
    return thirdQuartile + iqr
}
const computeAverageViews = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))
    const result = views.sum() / views.data().length
    return new Intl.NumberFormat().format(Math.trunc(result))
}
const computeEngagementRate = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))
    const likes = statistic(data.map(item => processNumbers(item.likes)))
    const comments = statistic(data.map(item => processNumbers(item.comments)))
    const shares = statistic(data.map(item => processNumbers(item.shares)))
    const engagementData = likes.sum() + comments.sum() + shares.sum()
    const result = engagementData / views.sum()
    return formatAsPercent(result)
}
const computeMedian = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))
    const result = views.median()
    return new Intl.NumberFormat().format(Math.trunc(result))
}
const formatAsPercent = num => {
    return new Intl.NumberFormat('default', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
}
const executionTime = startTime => {
    return (parseInt(performance.now()) - parseInt(startTime)) / 1000
}
const updateRecords = async (tableName, data) => {
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
const addInactiveToList = async (tableName, data) => {
    await base(tableName).create([data], (err, records) => {
        if (err)
            console.error(err)
    })
}
const logOnAirtable = async data => {
    try {
        const results = await base('Dobby_Logs').create([{
            "fields": {
                "Creator": `${data.creator}`,
                "Median": parseFloat(data.median.replace(/,/g, '')),
                "Average_Views": parseFloat(data.averageViews.replace(/,/g, '')),
                "Engagement_Rate": parseFloat(data.engagementRate.replace(/%/g, '')),
                "ErrorMessage": `${data.errorMessage === "" ? "None" : data.errorMessage}`,
                "Time": data.time,
                "Date": new Date(),
            }
        }])
        if (Object.keys(results).length === 0)
            console.log('Logged on Airtable')
    } catch (e) {
        console.log(e)
    }
}
const scrapeTikTok = async (webDriver, url) => {
    const driver = webDriver
    const data = []
    const startTime = performance.now()
    let errorMessage = ''
    let followers, profilePic
    try {
        const videoLinks = []
        // Get the creator main page
        await driver.get(url)
        let videosGrid, videos
        try {
            // Scrape the videos gird of the main page
            videosGrid = await driver.wait(until.elementLocated(By.css("div[mode='compact']")), 2000)
            videos = await videosGrid.findElements(By.xpath('div'))
            // Scrape the profile pic and followers count
            followers = (await (await driver.findElement(By.css('strong[title= "Followers"]'))).getText())
            profilePic = (await (await driver.findElement(By.xpath('//*[@id="app"]/div[2]/div[2]/div/div[1]/div[1]/div[1]/span/img'))).getAttribute('src'))
        } catch (e) {
            try {
                await driver.navigate().refresh()
                videosGrid = await driver.wait(until.elementLocated(By.css("div[mode='compact']")), 2000)
                videos = await videosGrid.findElements(By.xpath('div'))
                followers = (await (await driver.findElement(By.css('strong[title= "Followers"]'))).getText())
                profilePic = (await (await driver.findElement(By.xpath('//*[@id="app"]/div[2]/div[2]/div/div[1]/div[1]/div[1]/span/img'))).getAttribute('src'))
            } catch (e) {
                console.log('I got stuck in the main page')
                errorMessage = 'I got stuck in the main page'
                return {data: data, time: executionTime(startTime), errorMessage: errorMessage}
            }
        }
        // Process the data to extract the href and views counter
        for (let video of videos) {
            const href = (await (await video.findElement(By.xpath(`div[1]/div/div/a`))).getAttribute('href'))
            const videoViews = (await (await video.findElement(By.css(`strong[data-e2e='video-views']`))).getAttribute('innerText'))
            videoLinks.push({
                link: href,
                views: videoViews
            })
        }
        const outliersNumber = getOutliers(videoLinks)
        // Loop through array of videos, open each video link, scrape the needed data
        for (let video of videoLinks) {
            const link = video.link
            const views = video.views
            if (processNumbers(views) > outliersNumber)
                continue
            const scrapVideoData = async () => {
                await driver.get(link)
                const likesCount = (await (await driver.wait(until.elementLocated(By.css("strong[data-e2e='like-count']")), 5000)).getAttribute('innerText'))
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
                return {
                    likesCount: likesCount,
                    commentCounts: commentCounts,
                    shareCounts: shareCounts,
                    videoDate: videoDate,
                    videoCaption: videoCaption,
                    isPaid: isPaid,
                }
            }
            let results
            try {
                results = await scrapVideoData()
            } catch (e) {
                await driver.navigate().refresh()
                results = await scrapVideoData()
            }

            // Process Date
            let date
            results.videoDate.match(/[hdw]/gi) ? date = toDate(results.videoDate) : date = `${new Date().getFullYear()}-${results.videoDate}`
            if (checkDate(date))
                data.push({
                    views: video.views,
                    likes: results.likesCount,
                    comments: results.commentCounts,
                    shares: results.shareCounts,
                    date: results.videoDate,
                    paid: results.isPaid
                })
            if (data.length >= 10)
                break
        }
    } catch (e) {
        console.log(e)
        console.log("I got stuck while scraping videos")
        errorMessage = 'I got stuck while scraping videos'
    } finally {
        await driver.quit()
    }
    const time = executionTime(startTime)
    return {followers: followers, profilePic: profilePic, data: data, time: time, errorMessage: errorMessage}
}
const getScrapedTikTokData = async url => {
    try {
        const {followers, profilePic, data, time, errorMessage} = await scrapeTikTok(initiateDriver(), url)
        const averageViews = computeAverageViews(data)
        const engagementRate = computeEngagementRate(data)
        const median = computeMedian(data)
        return {
            creator: url.substring(url.indexOf('@') + 1),
            time: time,
            median: median,
            averageViews: averageViews,
            engagementRate: engagementRate,
            errorMessage: errorMessage,
            followers: followers,
            profilePic: profilePic
        }
    } catch (e) {
        console.log(e)
        return {error: 'error'}
    }
}

async function updateAirtable(platform, data) {
    const start = Date.now()
    const records = data.map(record => ({id: record.id, fields: record.fields}))
    console.log(`Total number of rows are being scraped: ${records.length}`)
    const error = []
    let counter = 1
    for (let record of records) {
        const updatedRecord = {}
        const url = record.fields.Profile.includes("https") ? record.fields.Profile : `https://www.${record.fields.Profile}`
        const tiktokData = await getScrapedTikTokData(url)
        if (!tiktokData.hasOwnProperty('error')) {
            // Update the fields values
            updatedRecord.Followers = tiktokData.followers
            updatedRecord['Social_Media_Profile_Picture'] = [{
                url: tiktokData.profilePic,
                filename: record.Name
            }]
            updatedRecord.Average_Viewers = parseFloat(tiktokData.averageViews.replace(/,/g, ''))
            updatedRecord.Engagement_Rate = parseFloat(tiktokData.engagementRate.replace(/%/g, ''))
            console.log(`${counter} ${record.fields.Name}`)
            record.fields = updatedRecord
            // Log the execution in dobby table
            await logOnAirtable(tiktokData)
            counter++
        } else {
            await logOnAirtable(tiktokData)
            error.push(record)
        }
    }
    const updatedRecords = records.filter(item => !item.fields.hasOwnProperty('Name'))
    console.log(updatedRecords)
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
    console.log(`Execution time: ${(Date.now() - start) / 1000}S`)
}

module.exports = updateAirtable

