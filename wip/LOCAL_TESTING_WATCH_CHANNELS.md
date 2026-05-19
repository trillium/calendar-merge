#!/usr/bin/env ts-node
/**
 * Test script for watch channel creation and removal
 *
 * Usage:
 *   1. Start local server: pnpm dev:server
 *   2. Start ngrok: ngrok http 8080
 *   3. Run this script: ts-node scripts/test-watch-channels.ts <ngrok-url>
 *
 * Example:
 *   ts-node scripts/test-watch-channels.ts https://abc123.ngrok.io
 */

import { Firestore } from '@google-cloud/firestore';
import { createCalendarWatch, stopCalendarWatch } from '../functions/calendar-sync/watch';

const firestore = new Firestore();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: Please provide ngrok URL');
    console.log('');
    console.log('Usage:');
    console.log('  ts-node scripts/test-watch-channels.ts <ngrok-url>');
    console.log('');
    console.log('Example:');
    console.log('  ts-node scripts/test-watch-channels.ts https://abc123.ngrok.io');
    process.exit(1);
  }

  const ngrokUrl = args[0];
  const webhookUrl = `${ngrokUrl}/webhook`;

  console.log('🧪 Watch Channel Testing');
  console.log('========================\n');
  console.log(`Webhook URL: ${webhookUrl}\n`);

  // Get user ID from Firestore (first user for testing)
  console.log('📋 Step 1: Finding test user...');
  const usersSnapshot = await firestore.collection('users').limit(1).get();

  if (usersSnapshot.empty) {
    console.error('❌ No users found in Firestore');
    console.log('Please authenticate at least once to create a user');
    process.exit(1);
  }

  const userId = usersSnapshot.docs[0].id;
  console.log(`✅ Found user: ${userId}\n`);

  // Get user's calendars
  console.log('📋 Step 2: Finding user calendars...');
  const userDoc = await firestore.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData?.config?.sourceCalendars || userData.config.sourceCalendars.length === 0) {
    console.error('❌ No source calendars configured for this user');
    console.log('Please configure calendars in the UI first');
    process.exit(1);
  }

  const calendarId = userData.config.sourceCalendars[0];
  console.log(`✅ Using calendar: ${calendarId}\n`);

  // Create watch
  console.log('📋 Step 3: Creating watch channel...');
  let channelId: string;

  try {
    channelId = await createCalendarWatch(
      userId,
      calendarId,
      webhookUrl,
      userData.config.targetCalendar
    );
    console.log(`✅ Watch created successfully!`);
    console.log(`   Channel ID: ${channelId}\n`);
  } catch (error: any) {
    console.error('❌ Failed to create watch:', error.message);
    process.exit(1);
  }

  // Verify watch in Firestore
  console.log('📋 Step 4: Verifying watch in Firestore...');
  const watchDoc = await firestore.collection('watches').doc(channelId).get();

  if (!watchDoc.exists) {
    console.error('❌ Watch document not found in Firestore');
    process.exit(1);
  }

  const watchData = watchDoc.data();
  console.log(`✅ Watch verified in Firestore`);
  console.log(`   User ID: ${watchData?.userId}`);
  console.log(`   Calendar ID: ${watchData?.calendarId}`);
  console.log(`   Resource ID: ${watchData?.resourceId}`);
  console.log(`   Expiration: ${new Date(watchData?.expiration).toISOString()}\n`);

  // Instructions for manual testing
  console.log('🎯 Manual Testing Instructions:');
  console.log('================================\n');
  console.log('1. Make a change to your calendar (create/edit/delete event)');
  console.log('2. Watch your local server logs for webhook notifications');
  console.log('3. You should see a POST request to /webhook');
  console.log('4. Press Enter when done testing to clean up...\n');

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Stop watch
  console.log('\n📋 Step 5: Stopping watch...');
  try {
    await stopCalendarWatch(userId, channelId, watchData.resourceId);
    console.log(`✅ Watch stopped successfully\n`);
  } catch (error: any) {
    console.error('❌ Failed to stop watch:', error.message);
  }

  // Delete watch document
  console.log('📋 Step 6: Cleaning up Firestore...');
  await watchDoc.ref.delete();
  console.log(`✅ Watch document deleted\n`);

  console.log('🎉 Test complete!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
