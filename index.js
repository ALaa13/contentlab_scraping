const updateAirtable = require('./tiktokScraping')
const Airtable = require('airtable')
const cron = require('cron')

// Initialize Airtable
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey:  'keyKOpl3rm3Q1r0MZ' //process.env.AIRTABLE_API_KEY
})
const base = Airtable.base("app0uHEtrxyWp3uzn");


(async () => {
    try {
        const tikTokData = await base('Social_Profiles').select({
            filterByFormula: '{Platform} = "TikTok"',
            maxRecords: 11
        }).all()
        await updateAirtable('TikTok', tikTokData)
    } catch (e) {
        console.log(e)
    }
})()