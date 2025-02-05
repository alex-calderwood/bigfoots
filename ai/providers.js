let config;

// Make sure you have a configuration file stroed at the project root in a file called config.json
const configureAI = (userConfig) => {
    config = userConfig;
};

// Access Gemini through Google's Node.js API
const callGemini = async (prompt) => { // https://ai.google.dev/gemini-api/docs/quickstart?lang=node
    if (!config[config.providers.llm]) return null;
    
    let gemini;
    try {
        gemini = require('@google/generative-ai').GoogleGenerativeAI;
    } catch(err) {
        console.log(`sv:ai:gemini: ${err}.\nInstall with:\n\tnpm install @google/generative-ai`)
        return null;
    }

    const genAI = new gemini(config[config.providers.llm]);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

// Access OpenAI
const callOpenAI = async (prompt) => {
    if (!config[config.providers.llm]) return null;
    
    let OpenAI;
    try {
        OpenAI = require('openai').default;
    } catch(err) {
        console.log(`sv:ai:openai: ${err}.\nInstall with:\n\tnpm install openai`)
        return null;
    }
        
    const openai = new OpenAI({
        apiKey: config.openai.key,
    });

    // write now we are using the gemini api key through the openai endpoint
    const response = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
    });
 
    return response.choices[0].message.content;
 }

 // Access Gemini through the OpenAI API
 // This is instructive on how you would access other models through the OpenAI API
 const callOpenAIGemini = async (prompt) => {
    if (!config[config.providers.llm]) return null;
    
    let OpenAI;
    try {
        OpenAI = require('openai').default;
    } catch(err) {
        console.log(`sv:ai:openai: ${err}.\nInstall with:\n\tnpm install openai`)
        return null;
    }
        
    const openai = new OpenAI({
        apiKey: config.openaiGemini.key,
        baseURL: config.openaiGemini?.url,
    });

    // write now we are using the gemini api key through the openai endpoint
    const response = await openai.chat.completions.create({
        model: config.openaiGemini.model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
    });
 
    return response.choices[0].message.content;
}

const llmProviders = {
    gemini: callGemini,
    openai: callOpenAI,
    openaiGemini: callOpenAIGemini, 
};

const ttsProviders = {
    'eleven_labs': async (text) => {
        if (!config[config.providers.text2speech]) {
            console.error('Missing 11 Labs API key');
            return null;
        }
        return new ArrayBuffer(0);
    },
    
    azure: async (text) => {
        if (!config[config.providers.text2speech]) {
            console.error('Missing Azure API key');
            return null;
        }
        return new ArrayBuffer(0);
    }
};

const llm = async (prompt) => {
    const provider = llmProviders[config.providers.llm];
    return provider ? provider(prompt) : null;
};

const textToSpeech = async (text) => {
    const provider = ttsProviders[config.providers.text2speech];
    return provider ? provider(text) : null;
};

module.exports = { llm, textToSpeech, configureAI};