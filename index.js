const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Trade = require('./Models/TradeModel');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

const connectToDatabase = async () => {
    try {
        await mongoose.connect(`mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.5ddn9tx.mongodb.net/crypto_trades?retryWrites=true&w=majority&appName=Cluster0`);
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};
connectToDatabase();

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const results = [];
        const filePath = path.resolve(__dirname, req.file.path);

        const stream = fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                const errors = [];

                if (!data.UTC_Time) {
                    errors.push('UTC_Time is required');
                }

                if (errors.length > 0) {
                    console.error('Validation errors for row:', data, errors);
                    res.status(400).json({ error: 'Validation errors occurred', details: errors });
                } else {
                    const [base_coin, quote_coin] = data.Market.split('/');
                    results.push({
                        utc_time: new Date(data.UTC_Time),
                        operation: data.Operation,
                        base_coin: base_coin,
                        quote_coin: quote_coin,
                        buy_sell_amount: parseFloat(data['Buy/Sell Amount']),
                        price: parseFloat(data.Price)
                    });
                }
            })
            .on('end', async () => {
                await Trade.insertMany(results);
                res.send('File processed and data saved.');
            })
            .on('error', (err) => {
                console.error('Error processing CSV:', err);
                res.status(500).send('Error processing upload');
            });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).send('Internal server error');
    }
});

app.post('/balance', async (req, res) => {
    try {
        const { timestamp } = req.body;
        const date = new Date(timestamp);

        if (isNaN(date.getTime())) {
            return res.status(400).json({ error: 'Invalid timestamp' });
        }

        // Find all trades up to the given timestamp
        const trades = await Trade.find({ utc_time: { $lte: date } });

        // Calculate balances
        const balances = trades.reduce((acc, trade) => {
            const { base_coin, operation, buy_sell_amount } = trade;
            if (!acc[base_coin]) {
                acc[base_coin] = 0;
            }
            if (operation.toLowerCase() === 'buy') {
                acc[base_coin] += buy_sell_amount;
            } else if (operation.toLowerCase() === 'sell') {
                acc[base_coin] -= buy_sell_amount;
            }
            return acc;
        }, {});

        res.json(balances);
    } catch (err) {
        console.error('Error calculating balance:', err);
        res.status(500).send('Internal server error');
    }
});

app.listen(3000, () => {
    console.log(`Server running on port ${process.env.port}`);
});
