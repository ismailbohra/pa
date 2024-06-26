const express = require('express');
const { 
    generateRegistrationOptions, 
    verifyRegistrationResponse, 
    generateAuthenticationOptions, 
    verifyAuthenticationResponse 
} = require('@simplewebauthn/server');
require('dotenv').config()
const crypto = require("node:crypto");
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static('./public'));
app.use(express.json());

// States
const userStore = {};
const challengeStore = {};

app.post('/register', (req, res) => {
    const { username } = req.body;

    if (userStore[username]) {
        return res.status(400).json({ error: 'User already exists' });
    }

    userStore[username] = { username, credentials: [] };

    return res.json({ username });
});

app.post('/register-challenge', async (req, res) => {
    const { userId } = req.body;

    if (!userStore[userId]) {
        return res.status(404).json({ error: 'User not found!' });
    }

    const user = userStore[userId];

    const challengePayload = await generateRegistrationOptions({
        rpID: process.env.RPID,
        rpName: 'My Localhost Machine',
        attestationType: 'none',
        userName: user.username,
        timeout: 30000,
    });

    challengeStore[userId] = challengePayload.challenge;

    return res.json({ options: challengePayload });
});

app.post('/register-verify', async (req, res) => {
    const { userId, cred }  = req.body;

    if (!userStore[userId]) {
        return res.status(404).json({ error: 'User not found!' });
    }

    const user = userStore[userId];
    const challenge = challengeStore[userId];

    const verificationResult = await verifyRegistrationResponse({
        expectedChallenge: challenge,
        expectedOrigin: process.env.RPORIGIN,
        expectedRPID: process.env.RPID,
        response: cred,
    });

    if (!verificationResult.verified) {
        return res.json({ error: 'Could not verify' });
    }

    user.credentials.push(verificationResult.registrationInfo);
    delete challengeStore[userId]; // Clear the challenge

    return res.json({ verified: true });
});

app.post('/login-challenge', async (req, res) => {
    const { username } = req.body;

    if (!userStore[username]) {
        return res.status(404).json({ error: 'User not found!' });
    }

    const opts = await generateAuthenticationOptions({
        rpID: process.env.RPID,
        userVerification: 'preferred',
    });

    challengeStore[username] = opts.challenge;

    return res.json({ options: opts });
});

app.post('/logout', async (req, res) => {
    const { username } = req.body;
    try {
        if (!userStore[username]) {
            return res.status(404).json({ error: 'User not found!' });
        }
        delete userStore[username];
        return res.json({ success: true });
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/login-verify', async (req, res) => {
    const { username, cred }  = req.body;

    if (!userStore[username]) {
        return res.status(404).json({ error: 'User not found!' });
    }

    const user = userStore[username];
    const challenge = challengeStore[username];

    const result = await verifyAuthenticationResponse({
        expectedChallenge: challenge,
        expectedOrigin: process.env.RPORIGIN,
        expectedRPID: process.env.RPID,
        response: cred,
        authenticator: user.credentials[0] // Assuming one credential for simplicity
    });

    if (!result.verified) {
        return res.json({ error: 'Something went wrong' });
    }

    // Login the user: Session, Cookies, JWT
    return res.json({ success: true, username });
});

app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
