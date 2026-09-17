# Simple Offline Test Guide

This guide helps you test the Farm Mobile app. You do not need to know coding.

## Important safety rules

1. Use a **test phone** and **test workers** only. Do not use real farm workers unless an adult says it is safe.
2. Ask an adult before pressing **Clear all**, **Remove**, or **Clear Cache**.
3. After every test, open `OFFLINE_TESTER_SHEET.md` and write **Pass**, **Fail**, or **Need help** next to that test number.
4. If something looks wrong, take a screenshot and tell an adult. Do not keep pressing buttons many times.

## Words to know

- **Online** means the phone has internet. Turn on Wi-Fi or mobile data.
- **Offline** means the phone has no internet. Turn on **Airplane Mode**.
- **Queue** is the app's waiting list. Jobs you do offline wait there until internet comes back.
- **Sync** means "send the waiting jobs to the farm server".
- **Force-close** means fully close the app from the phone's recent-apps screen.
- **Test worker** is a made-up worker used only for testing.

## Before you start

1. Ask an adult for the test worker names, worker IDs, block, and row numbers.
2. Turn internet **on**.
3. Open Farm Mobile and sign in.
4. Open Home, DayWork, Working, Clock, Fast, Totals, and Queue one time each.
5. In DayWork, choose the test block and wait until its rows show up.
6. Write the app version, your name, phone, and date at the top of `OFFLINE_TESTER_SHEET.md`.

## How to do each test

### OFF-01 - Home works with no internet

1. Make sure Home has loaded while online.
2. Turn on Airplane Mode.
3. Go to Home.
4. Check that you can still see the block and checked-in numbers.
5. Write **Pass** if the app stays open and shows information. Write **Fail** if it crashes or is blank.

### OFF-02 - DayWork remembers blocks and rows

1. While online, open DayWork and choose the test block.
2. Wait until the list of rows appears.
3. Turn on Airplane Mode.
4. Leave DayWork and open it again.
5. Check that the block and row list are still there.

### OFF-03 - App after being closed with no internet

1. First do the setup while online.
2. Turn on Airplane Mode.
3. Fully close the app from the recent-apps screen.
4. Open Farm Mobile again.
5. Write down exactly what happens. It may ask for internet before it lets you in; this is useful information, not your mistake.

### OFF-04 - Brand-new app with no internet

Ask an adult to do this test.

1. Use a fresh test install, or let an adult clear the app's storage.
2. Turn on Airplane Mode before opening the app.
3. Open Farm Mobile.
4. Check whether it can sign in and show farm information.
5. It is expected that it cannot load everything without internet. Record what you see.

### OFF-05 - Check in a worker offline

1. While online, choose a test block and row in DayWork.
2. Turn on Airplane Mode.
3. Type a test worker ID or choose a test worker.
4. Press **Submit check-in**.
5. Look for a message saying it was saved offline or queued.
6. Open Queue and check that it says 1 more job is waiting.

### OFF-06 - Check out a worker offline

1. Ask an adult which test worker is currently checked in.
2. While online, load that worker's information in DayWork.
3. Turn on Airplane Mode.
4. Fill in the checkout details and press **Submit checkout**.
5. Open Queue and check that the checkout job is waiting there.

### OFF-07 - Clock in offline

1. Open Clock while online first.
2. Turn on Airplane Mode.
3. Enter the agreed test worker ID.
4. Press **Clock in**.
5. Open Queue and make sure a Clock in job is waiting.

### OFF-08 - Clock out offline

1. Ask an adult for a test worker who is clocked in.
2. Open Clock while online first.
3. Turn on Airplane Mode.
4. Enter the test worker ID and press **Clock out**.
5. Open Queue and make sure a Clock out job is waiting.

### OFF-09 - Fast job offline

1. Open Fast while online first.
2. Turn on Airplane Mode.
3. Enter the test worker and job details given by an adult.
4. Press **Submit fast piecework**.
5. Open Queue and check that the fast job is waiting.

### OFF-10 - Move a worker offline

1. Ask an adult to show you a test worker who is working.
2. Open Move while online and find that worker.
3. Turn on Airplane Mode.
4. Choose the new test row and press the button to move the worker.
5. Open Queue and check that the move is waiting.

### OFF-11 - Swap two workers offline

Ask an adult to help with this test.

1. Find two test workers who can be swapped.
2. Open Move while online and choose **Swap**.
3. Turn on Airplane Mode.
4. Pick the two test workers and press the swap button.
5. Open Queue and check that the swap is waiting.

### OFF-12 - Add a worker offline

1. Ask an adult for a made-up test worker ID and name.
2. Turn on Airplane Mode.
3. On Home, open **Admin** and press **Add worker**.
4. Enter the made-up details and press **Add worker**.
5. Open Queue and check that the Add worker job is waiting.
6. Do not tell real workers they were added until an adult confirms the job has synced.

### OFF-13 - Waiting jobs stay after closing the app

1. Make at least two waiting jobs using the earlier tests.
2. Turn on Airplane Mode.
3. Fully close Farm Mobile.
4. Open it again and go to Queue.
5. Check that the same waiting jobs are still listed.

### OFF-14 - Send waiting jobs when internet returns

1. Have at least one job in Queue.
2. Turn off Airplane Mode and wait for internet to return.
3. Open Home and press **Sync queued actions now**, or open Queue and press **Sync all**.
4. Wait for the message.
5. Check that the job disappears from Queue.
6. Ask an adult to check that the job really happened on the server.

### OFF-15 - Send waiting jobs by reopening the app

1. Have at least one job in Queue while offline.
2. Fully close the app.
3. Turn off Airplane Mode.
4. Open the app again.
5. Wait a short time, then open Queue.
6. Check if the job was sent or if it shows an error.

### OFF-16 - Internet returns while the app is still open

1. Have a job waiting in Queue.
2. Keep the app open and turn off Airplane Mode.
3. Wait one minute.
4. Open Queue and see if the job is still waiting.
5. If it is still waiting, press **Sync all**.
6. Write down what happened before you pressed Sync.

### OFF-17 - A waiting job has a problem

Ask an adult to prepare this test safely.

1. Make a job wait in Queue while offline.
2. Have an adult make that job impossible on the test server, for example by checking out the same test worker there.
3. Turn internet back on.
4. Press **Sync all**.
5. Check that the job stays in Queue and shows an error message.
6. Take a screenshot of the error.

### OFF-18 - Fix a problem in Queue

1. Start with a waiting job that shows an error from OFF-17.
2. Open Queue and press **Resolve conflict**.
3. Ask an adult which detail needs to be changed.
4. Change only that detail, then press **Save and retry**.
5. Check whether it disappears from Queue or shows a new helpful error.

### OFF-19 - Remove one waiting job

Ask an adult before doing this.

1. Make sure at least two test jobs are waiting in Queue.
2. Pick the job the adult says you may remove.
3. Press **Remove** on that one job.
4. Check that only that job disappeared and the other job is still there.

### OFF-20 - Clear all waiting jobs

Ask an adult before doing this. Use test jobs only.

1. Make at least one test job wait in Queue.
2. Press **Clear all**.
3. Check that Queue says there are no waiting jobs.
4. Tell the adult. Cleared jobs will not be sent later.

### OFF-21 - Clear cache does not clear waiting jobs

Ask an adult before doing this.

1. Make one test job wait in Queue.
2. On Home, press **Clear Cache**.
3. Open Queue.
4. Check that the waiting job is still there.
5. It is okay if some old screen information has disappeared. The important part is that Queue did not disappear.

### OFF-22 - Check for duplicate jobs

Ask an adult to help. Do this with test data only.

1. Turn internet on.
2. Start one simple test action, such as a check-in.
3. Right after pressing Submit, quickly turn on Airplane Mode.
4. Wait for the app to finish or show a message.
5. Turn internet back on and look in Queue before pressing Sync again.
6. Ask an adult to check the server for the test worker.
7. Write down whether the action happened zero times, once, or more than once. More than once is a **Fail**.

## When you are finished

1. Make sure Airplane Mode is off.
2. Tell an adult about every Fail, Need help, or screenshot.
3. Do not clear or remove waiting jobs unless the adult says it is okay.
4. Give the completed `OFFLINE_TESTER_SHEET.md` and screenshots to the project owner.
