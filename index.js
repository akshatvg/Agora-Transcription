// Create Agora RTC client
var client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
// JavaScript Speech Recognition Init
var SpeechRecognition = window.webkitSpeechRecognition || window.speechRecognition;
var recognition = new webkitSpeechRecognition() || new SpeechRecognition();
var transContent = "";
var noteContent = "";
recognition.continuous = true;
// RTM Global Vars
var isLoggedIn = false;
// Local Tracks
var localTracks = {
  videoTrack: null,
  audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: null,
  channel: null,
  uid: null,
  token: null,
  accountName: null
};

// Join Channel
$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  try {
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    options.channel = $("#channel").val();
    options.accountName = $('#accountName').val();
    await join();
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
    $("#transcribe").attr("disabled", false);
    $("#note").attr("disabled", false);
  }
})

// Leave Channel
$("#leave").click(function (e) {
  leave();
})

// Join Function
async function join() {
  // Add event listener to play remote tracks when remote user publishes
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);
  // Join a channel and create local tracks, we can use Promise.all to run them concurrently
  [options.uid, localTracks.audioTrack, localTracks.videoTrack] = await Promise.all([
    // Join the channel
    client.join(options.appid, options.channel, options.token || null),
    // Create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);
  // Play local video track
  localTracks.videoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);
  // Publish local tracks to channel
  await client.publish(Object.values(localTracks));
  console.log("Publish success");
  // Create Agora RTM client
  const clientRTM = AgoraRTM.createInstance($("#appid").val(), { enableLogUpload: false });
  var accountName = $('#accountName').val();
  // Login
  clientRTM.login({ uid: accountName }).then(() => {
    console.log('AgoraRTM client login success. Username: ' + accountName);
    isLoggedIn = true;
    // RTM Channel Join
    var channelName = $('#channel').val();
    channel = clientRTM.createChannel(channelName);
    channel.join().then(() => {
      console.log('AgoraRTM client channel join success.');
      // Start transcription for all (RTM)
      $("#transcribe").click(function () {
        console.log('Voice recognition is on.');
        $("#transcribe").attr("disabled", true);
        $("#stop-transcribe").attr("disabled", false);
        $("#stop-note").attr("disabled", true);
        $("#note").attr("disabled", true);
        if (transContent.length) {
          transContent += ' ';
        }
        recognition.start();
      });
      // Stop transcription for all (RTM)
      $("#stop-transcribe").click(function () {
        console.log('Voice recognition is off.');
        recognition.stop();
        recognition.onresult = function (event) {
          var current = event.resultIndex;
          var transcript = event.results[current][0].transcript;
          transContent = transContent + transcript + "<br>";
          singleMessage = transContent;
          channel.sendMessage({ text: singleMessage }).then(() => {
            console.log("Message sent successfully.");
            console.log("Your message was: " + singleMessage + " by " + accountName);
            $("#actual-text").append("<br> <b>Speaker:</b> " + accountName + "<br> <b>Message:</b> " + singleMessage + "<br>");
            transContent = ''
          }).catch(error => {
            console.log("Message wasn't sent due to an error: ", error);
          });
        };
        $("#note").attr("disabled", false);
        $("#stop-note").attr("disabled", true);
        $("#stop-transcribe").attr("disabled", true);
        $("#transcribe").attr("disabled", false);
      });
      // Receive RTM Channel Message
      channel.on('ChannelMessage', ({ text }, senderId) => {
        console.log("Message received successfully.");
        console.log("The message is: " + text + " by " + senderId);
        $("#actual-text").append("<br> <b>Speaker:</b> " + senderId + "<br> <b>Message:</b> " + text + "<br>");
      });
    }).catch(error => {
      console.log('AgoraRTM client channel join failed: ', error);
    }).catch(err => {
      console.log('AgoraRTM client login failure: ', err);
    });
  });
  document.getElementById("leave").onclick = async function () {
    console.log("Client logged out of RTM.");
    await clientRTM.logout();
  }
}

// Leave Function
async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  // Remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // Leave the channel
  await client.leave();
  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#note").attr("disabled", true);
  $("#transcribe").attr("disabled", true);
  $("#stop-transcribe").attr("disabled", true);
  $("#stop-note").attr("disabled", true);
  console.log("Client leaves channel success");
}

// Subscribe function
async function subscribe(user, mediaType) {
  const uid = user.uid;
  // Subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("Subscribe success");
  if (mediaType === 'video') {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === 'audio') {
    user.audioTrack.play();
  }
}

// User published callback
function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

// User unpublish callback
function handleUserUnpublished(user) {
  const id = user.uid;
  delete remoteUsers[id];
  $(`#player-wrapper-${id}`).remove();
}

// Start self notes
$("#note").click(function () {
  console.log('Voice recognition is on.');
  $("#stop-note").attr("disabled", false);
  $("#note").attr("disabled", true);
  $("#stop-transcribe").attr("disabled", true);
  $("#transcribe").attr("disabled", true);
  if (noteContent.length) {
    noteContent += ' ';
  }
  recognition.start();
});

// Stop self notes
$("#stop-note").click(function () {
  console.log('Voice recognition is off.');
  recognition.stop();
  recognition.onresult = function (event) {
    var current = event.resultIndex;
    var transcript = event.results[current][0].transcript;
    noteContent = noteContent + transcript + "<br>";
    $("#note-text").append("<b><i>You said: </i></b> " + noteContent);
    noteContent = '';
  };
  $("#note").attr("disabled", false);
  $("#stop-note").attr("disabled", true);
  $("#stop-transcribe").attr("disabled", true);
  $("#transcribe").attr("disabled", false);
});

// Can't recognise voice
recognition.onerror = function (event) {
  if (event.error == 'no-speech') {
    console.log('Could you please repeat? I didn\'t get what you\'re saying.');
    recognition.stop();
    recognition.start();
  }
}