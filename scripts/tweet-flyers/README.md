# SolMaker x Pump.fun Tweet Flyer Generator

Automatically generates promotional flyers from tweets using OpenAI's gpt-image-1.5 model.

## Setup

1. **Set your OpenAI API Key**:
   ```bash
   export OPENAI_API_KEY="sk-your-api-key-here"
   ```

   Or add it to your `.env` file:
   ```env
   OPENAI_API_KEY=sk-your-api-key-here
   ```

2. **Install dependencies** (if not already installed):
   ```bash
   npm install openai
   ```

3. **Edit your tweets**:
   - Open `scripts/tweet-flyers/tweets.json`
   - Add/edit your tweet content
   - Each tweet should have:
     - `headline`: Main title for the flyer
     - `content`: The tweet text
     - `hashtags`: Array of hashtags (optional)

## Usage

Run the script to generate one flyer at a time:

```bash
node scripts/generate-tweet-flyers.js
```

**First run**: Generates flyer for tweet #1
**Second run**: Generates flyer for tweet #2 (remembers #1 is done)
**Third run**: Generates flyer for tweet #3
...and so on!

## How It Works

1. **Tracks Progress**: Uses `progress.json` to remember which tweets have been processed
2. **One at a Time**: Processes only the next unprocessed tweet each run
3. **High Quality**: Uses DALL-E 3 HD quality in vertical format (1024x1792)
4. **Organized Output**: Saves all generated flyers to `scripts/tweet-flyers/generated/`

## File Structure

```
scripts/
└── tweet-flyers/
    ├── tweets.json          # Your tweet content (edit this!)
    ├── progress.json        # Auto-generated progress tracker
    └── generated/           # Generated flyer images
        ├── flyer-001-*.png
        ├── flyer-002-*.png
        └── ...
```

## Cost Estimate

- gpt-image-1.5 HD (1024x1792): Cost varies based on your OpenAI plan
- Check OpenAI pricing for current rates

## Customization

Edit `generate-tweet-flyers.js` to customize:
- Image size (line 96)
- Quality: "hd" or "standard" (line 97)
- Style: "vivid" or "natural" (line 98)
- Prompt template (lines 73-87)

## Tips

- Run the script whenever you're ready to generate the next flyer
- Preview the generated images before batch processing
- Adjust the prompt template to match your brand style
- Keep tweets concise for better flyer readability
