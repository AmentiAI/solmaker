import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read env manually to avoid dotenv message
const envPath = resolve('.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

const BASE_URL = process.argv[2] || envVars.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const TEST_WALLET = process.argv[3] || envVars.TEST_WALLET_ADDRESS || 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testVideoGeneration() {
  console.log('Video Generation Test Script');
  console.log('================================\n');
  console.log('Base URL: ' + BASE_URL);
  console.log('Test Wallet: ' + TEST_WALLET + '\n');

  try {
    // Step 1: Upload image to blob storage
    console.log('Step 1: Uploading image to blob storage...');
    
    const imagePath = resolve('./public/Alien_Hoodie.jpeg');
    const imageBuffer = readFileSync(imagePath);
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('image', blob, 'Alien_Hoodie.jpeg');
    formData.append('wallet_address', TEST_WALLET);

    const uploadRes = await fetch(BASE_URL + '/api/promotion/upload-image', {
      method: 'POST',
      body: formData,
    });

    const uploadData = await uploadRes.json();
    
    if (!uploadRes.ok) {
      throw new Error('Upload failed: ' + JSON.stringify(uploadData));
    }

    // API returns imageUrl, not url
    const uploadedImageUrl = uploadData.imageUrl;
    if (!uploadedImageUrl) {
      throw new Error('Upload succeeded but no imageUrl returned: ' + JSON.stringify(uploadData));
    }
    
    console.log('Image uploaded: ' + uploadedImageUrl + '\n');

    // Step 2: Create video generation job
    console.log('Step 2: Creating video generation job...');
    
    const generateRes = await fetch(BASE_URL + '/api/promotion/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: TEST_WALLET,
        video_source_type: 'upload',
        uploaded_image_url: uploadedImageUrl,
        video_scene: 'An alien fights donald trump in a boxing ring',
        video_actions: 'punching and fighting',
        video_speech: '',
        aspect_ratio: 'square',
      }),
    });

    const generateData = await generateRes.json();
    
    if (!generateRes.ok) {
      throw new Error('Generate failed: ' + JSON.stringify(generateData));
    }

    const jobId = generateData.job_id;
    console.log('Job created: ' + jobId + '\n');

    // Step 3: Poll for status (like frontend does)
    console.log('Step 3: Polling for job status...');
    console.log('   (Polling every 2 seconds, Kie AI check every 30 seconds)\n');

    let pollCount = 0;
    let lastKieAiCheck = 0;
    let taskId = null;
    let finalStatus = null;
    let finalResult = null;

    while (true) {
      pollCount++;
      
      // Fetch job status
      const statusRes = await fetch(
        BASE_URL + '/api/promotion/jobs/' + encodeURIComponent(jobId) + '?wallet_address=' + encodeURIComponent(TEST_WALLET)
      );
      
      if (!statusRes.ok) {
        const err = await statusRes.json();
        console.log('   Poll ' + pollCount + ': Status fetch failed: ' + JSON.stringify(err));
        await sleep(2000);
        continue;
      }

      const statusData = await statusRes.json();
      const job = statusData.job;
      const status = job?.status;
      
      // Extract taskId from error_message if present
      if (job?.error_message) {
        const taskIdMatch = job.error_message.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/);
        if (taskIdMatch) {
          taskId = taskIdMatch[1].trim();
        }
      }

      console.log('   Poll ' + pollCount + ': status=' + status + ', taskId=' + (taskId || 'none'));

      if (status === 'completed') {
        console.log('\nJob completed!');
        console.log('   Video URL: ' + job.image_url);
        finalStatus = 'completed';
        finalResult = job;
        break;
      }

      if (status === 'failed') {
        console.log('\nJob failed!');
        console.log('   Error: ' + job.error_message);
        console.log('   Full job data: ' + JSON.stringify(job, null, 2));
        finalStatus = 'failed';
        finalResult = job;
        break;
      }

      // If stuck in processing with taskId, check with Kie AI every 30 seconds (15 polls)
      if (status === 'processing' && taskId && (pollCount - lastKieAiCheck) >= 15) {
        lastKieAiCheck = pollCount;
        console.log('\n   Checking with Kie AI (taskId: ' + taskId + ')...');
        
        try {
          const kieRes = await fetch(BASE_URL + '/api/promotion/manual-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, jobId }),
          });
          const kieData = await kieRes.json();
          
          if (kieData.message === 'Task still processing') {
            console.log('   Kie AI status: Still processing (successFlag: ' + kieData.successFlag + ')');
            console.log('   Will check again in 30 seconds...');
          } else if (kieData.success && kieData.videoUrl) {
            console.log('   Kie AI status: Completed!');
            console.log('   Video URL: ' + kieData.videoUrl);
          } else if (kieData.success && kieData.error) {
            console.log('   Kie AI status: Failed');
            console.log('   Error: ' + kieData.error);
          } else {
            console.log('   Kie AI callback result: ' + JSON.stringify(kieData, null, 2));
          }
          
          if (kieData.kieAiResponse) {
            console.log('   Kie AI raw details:');
            console.log('     - code: ' + kieData.kieAiResponse.code);
            console.log('     - successFlag: ' + kieData.kieAiResponse.successFlag);
            console.log('     - errorMessage: ' + kieData.kieAiResponse.errorMessage);
            console.log('     - hasResultUrls: ' + kieData.kieAiResponse.hasResultUrls);
          }
        } catch (kieErr) {
          console.log('   Kie AI check failed: ' + kieErr.message);
        }
        console.log('');
      }

      // Timeout after 10 minutes (300 polls at 2 seconds each)
      if (pollCount >= 300) {
        console.log('\nTimeout after ' + (pollCount * 2) + ' seconds');
        finalStatus = 'timeout';
        finalResult = job;
        break;
      }

      await sleep(2000);
    }

    // Summary
    console.log('\n================================');
    console.log('Test Summary');
    console.log('================================');
    console.log('Final Status: ' + finalStatus);
    console.log('Total Polls: ' + pollCount);
    console.log('Time Elapsed: ~' + (pollCount * 2) + ' seconds');
    if (finalResult?.image_url) {
      console.log('Video URL: ' + finalResult.image_url);
    }
    if (finalResult?.error_message && finalStatus === 'failed') {
      console.log('Error: ' + finalResult.error_message);
    }

  } catch (error) {
    console.log('\nTest failed with error: ' + error.message);
    process.exit(1);
  }
}

testVideoGeneration();
