# Quick Start Guide

## 1️⃣ Setup (One Time)

Make sure your `.env` file in the project root has your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-actual-key-here
```

## 2️⃣ Customize Your Tweets

Edit `scripts/tweet-flyers/tweets.json` with your actual tweet content:

```json
[
  {
    "headline": "Your Main Title",
    "content": "Your tweet text here...",
    "hashtags": ["#SolMaker", "#PumpFun"]
  }
]
```

## 3️⃣ Run the Script

Generate one flyer at a time:

```bash
node scripts/generate-tweet-flyers.js
```

**That's it!** Each time you run it:
- ✅ Generates the next unprocessed tweet
- 💾 Saves the flyer to `scripts/tweet-flyers/generated/`
- 📝 Tracks progress automatically
- 🔄 Run again for the next one

## Example Output

```
🚀 SolMaker x Pump.fun Tweet Flyer Generator

📊 Total tweets: 5
✅ Completed: 0
⏳ Remaining: 5

📝 Processing tweet 1/5

🎨 Generating flyer for tweet 1...
Tweet: "Revolutionary NFT creation meets viral token launching..."
⬇️  Downloading image...
✅ Saved: flyer-001-1707234567890.png

✨ Success! Run the script again to process the next tweet.
Progress: 1/5 completed
```

## Files Generated

```
scripts/tweet-flyers/
├── generated/
│   ├── flyer-001-*.png  ← First flyer
│   ├── flyer-002-*.png  ← Second flyer
│   └── ...
├── progress.json        ← Auto-generated tracker
└── tweets.json          ← Your tweet content
```

## Tips

- 💡 Run the script when you're ready for the next flyer
- 🎨 Each flyer is unique based on the AI generation
- 💰 Uses gpt-image-1.5 model (check OpenAI pricing)
- 📏 Generates vertical format (1024x1792) perfect for social media
