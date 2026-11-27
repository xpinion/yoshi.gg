// ============================================================
//  STORY & DIALOGUE for biomes 2-5 and the ending — edit any text here.
//  Cutscene panels use "stage" scenes: { bg, actors: [...] }
//    bg: sewer | wasteland | trees | swamp | tunnels | village | cave | night
//    actor: { a: <cat name or flea/birdqueen/serpent/molequeen/ratking/gerald/cage/nest/can/bubble/hole/wand/confetti>,
//             x: 0-1 across, y: 0-1 down, s: size, f: facing (1 or -1), pose, eyes }
// ============================================================
(function () {
  const S = PM.STORY;

  Object.assign(S.bandit, {
    flea: "Bandit here. Tiny FLEAS! They hop at you. Pounce on 'em or swipe 'em. Don't let them in your fur. Trust me.",
    bigflea: "Chunky flea! Two hits. Ew. Ew ew ew.",
    beetle: "Beetles! Fast and crunchy. A swipe does the trick.",
    bird: "Little birds! They swoop down when you walk under them. Pounce on them or swipe them out of the air!",
    crow: "That's a crow. Bigger, meaner, two hits. Watch out for the swoop!",
    squirrel: "Squirrels! They run along the branches really fast. Don't let them knock you off.",
    snake: "Tiny snakes! The Serpent's little helpers. Swipe 'em!",
    bigsnake: "Big snake. Two hits. I'll just be over here. Far away.",
    frog: "Frogs! They hop around. One bonk and they're done.",
    eel: "EELS in the water! Swim around them or swipe them.",
    mole: "Tiny moles! They pop down into the dirt — you can only hit them when they're up top.",
    guardmole: "That's a Royal Guard mole with a helmet. Three hits! Or one good pounce.",
    scuba: "Bandit here! You found a CAT SCUBA SUIT! Now you can swim! In water, press jump to paddle up, and S/↓ to dive down.",
    water: "Whoa — you can't swim without a scuba suit!",
    wand: "That's a KITTY WAND! Hold I and let go to throw it. Clyde says it's the key to beating the Bird Queen!",
    worm: "An EARTHWORM! Moles LOVE these. Hold I and throw it AWAY from you, and see who comes running...",
    pinned: "She's pinned! Swipe her with your paw (U)! Three good scratches!",
  });

  Object.assign(S.clyde, {
    dusty_pre: "Clyde here. That's Dusty the Scrapper, another one of the Queen's moles. He throws scrap metal while he walks. Make him charge into the wall, then swipe him!",
    giantflea_pre: "This is it — the Giant Flea has you cornered! Keep MOVING, he drops bombs. Puff balls will pop up around the arena. When he gets tired and sits down, throw a puff ball right at his FACE!",
    giantflea_p2: "He's dropping two bombs now! Keep running, grab a puff ball, wait for him to get tired!",
    giantflea_p3: "Watch for his shadow — sometimes he jumps super high and lands right where you are!",
    gus_pre: "Gus the Glider, up ahead! He tosses acorns. Same trick as always: dodge his charge so he bonks into the wall, then swipe!",
    birdqueen_pre: "The Bird Queen! She'll swoop at you — get out of the way! When she gets tired she'll hover down low. THAT's when you throw the kitty wand (hold I) to pin her down. Then scratch her three times!",
    birdqueen_p2: "She's calling in little birds now. Bonk them and stay focused on the Queen!",
    birdqueen_p3: "Feather darts! Keep moving, and wait for her to get tired again.",
    sally_pre: "Snorkel Sally! She spits mud balls. Dodge her charge, then swipe her when she's stuck!",
    serpent_pre: "The Serpent moves under the dirt — watch for the moving trail! When she's right under you, the ground rumbles. MOVE! After she lunges, her head flops down — bonk it! Three scratches each round!",
    serpent_p2: "Now she spits venom after she lunges. Bonk her, then get out of the way!",
    serpent_p3: "She's faster and pops up in random spots now. Stay sharp!",
    brutus_pre: "Brutus, the Queen's Royal Guard. He's tough and digs under you a lot. Same plan: dodge, stuck, SWIPE!",
    molequeen_pre: "This is it. The Mole Queen herself. Her weak spot is on her BACK. Swipe the flower pots to find earthworms, throw a worm away from you, and while she's munching, hit her from behind!",
    molequeen_p2: "She's digging underground now, just like Digby! Keep moving!",
    molequeen_p3: "Dirt clods AND tiny moles! You've got this, Pholia!",
    molequeen_p4: "WHAT?! A FOURTH phase?! She's way faster, rocks are falling, and you need to hit her back THREE times each worm! GO GO GO!",
  });

  S.tommy.push(
    "Still waiting. Gerald says the weather is nice up here.",
    "Still waiting. I taught Gerald to play fetch. He's not very good at it.",
    "Still waiting. Do you think Gerald likes me? He never says anything.",
    "Still waiting. I made us snacks. Gerald didn't eat his. More for me.",
    "Still waiting. I've counted every blade of grass. There are a lot.",
    "Still waiting. Gerald is napping. I'm napping too. Zzz... wait. Still waiting.",
    "Still waiting. Is that you I hear digging? Or a mole? Hopefully you.",
    "Still waiting. Gerald and I made a welcome-home banner. It says 'WELCOM'. We ran out of paint.",
    "Still waiting. Almost? Please say almost.",
    "Still waiting. Gerald believes in you. I do too!",
  );

  Object.assign(S.levelStart, {
    11: [{ from: 'clyde', text: "Pholia, RUN! The Giant Flea is right behind us! You'll keep running automatically — just jump, duck and dash. Hold ← to slow down a little, → to speed up. DON'T let him catch you!" }],
    12: [{ from: 'bandit', text: "Bandit here! I'm stuck in a tin can somewhere in this wasteland. It echoes in here. ...here... ...here..." }],
    16: [{ from: 'bobby', text: "Bobby here. I just want to say: running from a flea? Iconic. Not in a good way." }],
    21: [{ from: 'bobby', text: "Pholia, it's Bobby. I'm stuck in a bird's NEST. At the top of a tree. My fur is RUINED. Hurry up." }, { from: 'bandit', text: "Watch your step up there — no ground in the tall trees. Branches only!" }],
    29: [{ from: 'clyde', text: "Look for a KITTY WAND right before the Bird Queen's nest. You'll need it!" }],
    31: [{ from: 'bandit', text: "Swamp time! There's water everywhere. You'll need a scuba suit... I bet there's one nearby!" }],
    32: [{ from: 'chalice', text: "Chalice here. I'm stuck in a bubble in this swamp. I've been selling things to fish. Business is slow." }],
    41: [{ from: 'clyde', text: "These are the Mole Queen's tunnels. It's a MAZE down here. Explore! The exit could be up, down, anywhere." }],
    49: [{ from: 'clyde', text: "The Queen's throne room is close. Look for flower pots — she can't resist earthworms." }],
    50: [{ from: 'tommy', text: "Still waiting here. ...Oh! Is this the last level? Gerald, get the banner!" }],
  });

  const C = S.cutscenes;
  C.flea_defeated = [
    [
      { scene: { bg: 'wasteland', actors: [{ a: 'flea', x: 0.5, y: 0.85, s: 1, f: -1, eyes: 'x' }] }, caption: 'The Giant Flea is defeated!', speech: [{ who: 'flea', text: "Boing... I just wanted... a fluffy cat to live in..." }] },
      { scene: { bg: 'wasteland', actors: [{ a: 'can', x: 0.5, y: 0.85 }, { a: 'bandit', x: 0.5, y: 0.82, s: 1.6, pose: 'sit' }] }, speech: [{ who: 'bandit', text: "PHOLIA! You got me out of the can! It smelled like old beans in there." }] },
    ],
    [
      { scene: { bg: 'wasteland', actors: [{ a: 'pholia', x: 0.3, y: 0.85, s: 1.6, eyes: 'happy' }, { a: 'clyde', x: 0.5, y: 0.85, s: 1.6, f: -1 }, { a: 'bandit', x: 0.7, y: 0.85, s: 1.6, f: -1, eyes: 'happy' }] }, caption: 'Bandit joins the team!', speech: [{ who: 'bandit', text: "Two rescued, three to go. And I have SO many facts about trees." }] },
      { scene: { bg: 'cave', actors: [{ a: 'molequeen', x: 0.5, y: 0.85, s: 1.2 }] }, caption: 'Meanwhile...', speech: [{ who: 'molequeen', text: "Defeated by a CAT?! Bird Queen! Keep her out of the trees!" }] },
    ],
    [{ scene: { bg: 'trees', actors: [{ a: 'pholia', x: 0.3, y: 0.9, s: 1.4 }, { a: 'clyde', x: 0.2, y: 0.9, s: 1.4 }, { a: 'bandit', x: 0.1, y: 0.9, s: 1.4 }] }, caption: 'Next stop: the Tall Trees. Way, WAY up.', speech: [{ who: 'clyde', text: "I'm... not great with heights." }] }],
  ];
  C.birdqueen_defeated = [
    [
      { scene: { bg: 'trees', actors: [{ a: 'birdqueen', x: 0.5, y: 0.85, s: 1, eyes: 'x' }, { a: 'wand', x: 0.75, y: 0.85, s: 2, broken: true }] }, caption: 'The Bird Queen is defeated! (The kitty wand snapped in half.)', speech: [{ who: 'birdqueen', text: "My beautiful trees... fine! Take your silly cat friend!" }] },
      { scene: { bg: 'trees', actors: [{ a: 'nest', x: 0.5, y: 0.8 }, { a: 'bobby', x: 0.5, y: 0.74, s: 1.6, pose: 'sit', eyes: 'happy' }] }, speech: [{ who: 'bobby', text: "Took you long enough. ...Thank you. Don't make it weird." }] },
    ],
    [
      { scene: { bg: 'trees', actors: [{ a: 'pholia', x: 0.25, y: 0.88, s: 1.5, eyes: 'happy' }, { a: 'bobby', x: 0.42, y: 0.88, s: 1.5, f: -1 }, { a: 'clyde', x: 0.6, y: 0.88, s: 1.5, f: -1 }, { a: 'bandit', x: 0.78, y: 0.88, s: 1.5, f: -1 }] }, caption: 'Bobby joins the team!', speech: [{ who: 'bobby', text: "I'll keep rating you, obviously. Current grade: B-plus. Room to grow." }] },
      { scene: { bg: 'cave', actors: [{ a: 'molequeen', x: 0.5, y: 0.85, s: 1.2 }] }, caption: 'Meanwhile...', speech: [{ who: 'molequeen', text: "Serpent! She's coming to your swamp. Do NOT mess this up." }] },
    ],
    [{ scene: { bg: 'swamp', actors: [{ a: 'pholia', x: 0.35, y: 0.88, s: 1.4 }, { a: 'bobby', x: 0.22, y: 0.88, s: 1.4 }] }, caption: 'Down from the trees... and into the soggy Swamp.', speech: [{ who: 'bobby', text: "Mud. Great. My favorite. (That was sarcasm.)" }] }],
  ];
  C.serpent_defeated = [
    [
      { scene: { bg: 'swamp', actors: [{ a: 'serpent', x: 0.5, y: 0.85, eyes: 'x' }] }, caption: 'The Serpent is defeated!', speech: [{ who: 'serpent', text: "Ssssigh. I'm going to go sssulk under a rock." }] },
      { scene: { bg: 'swamp', actors: [{ a: 'bubble', x: 0.5, y: 0.6 }, { a: 'chalice', x: 0.5, y: 0.7, s: 1.6, pose: 'sit' }] }, speech: [{ who: 'chalice', text: "Finally. Do you know how hard it is to run a shop from inside a bubble? Very. That's how hard." }] },
    ],
    [
      { scene: { bg: 'swamp', actors: [{ a: 'pholia', x: 0.2, y: 0.88, s: 1.4, eyes: 'happy' }, { a: 'chalice', x: 0.36, y: 0.88, s: 1.4, f: -1 }, { a: 'bobby', x: 0.52, y: 0.88, s: 1.4, f: -1 }, { a: 'clyde', x: 0.68, y: 0.88, s: 1.4, f: -1 }, { a: 'bandit', x: 0.84, y: 0.88, s: 1.4, f: -1 }] }, caption: 'Chalice joins the team!', speech: [{ who: 'chalice', text: "I'll still be charging you, by the way. Friends and family discount: zero percent." }] },
      { scene: { bg: 'cave', actors: [{ a: 'molequeen', x: 0.5, y: 0.85, s: 1.3 }] }, caption: 'Deep, deep underground...', speech: [{ who: 'molequeen', text: "Fine. If you want something done right... you do it YOURSELF. Come to my tunnels, kitty." }] },
    ],
    [{ scene: { bg: 'tunnels', actors: [{ a: 'pholia', x: 0.5, y: 0.88, s: 1.6 }] }, caption: "Into the Mole Queen's tunnels. Only Tommy is left... wherever he is.", speech: [{ who: 'tommy', text: "*kzzt* Still waiting here!" }] }],
  ];
  C.molequeen_defeated = [
    [
      { scene: { bg: 'tunnels', actors: [{ a: 'molequeen', x: 0.5, y: 0.85, s: 1.3 }, { a: 'hole', x: 0.5, y: 0.9 }] }, caption: 'The Mole Queen is defeated... but she digs away!', speech: [{ who: 'molequeen', text: "You haven't seen the last of me, calico! I have MORE tunnels! BIGGER tunnels! Hmph!" }] },
      { scene: { bg: 'tunnels', actors: [{ a: 'hole', x: 0.5, y: 0.9 }, { a: 'pholia', x: 0.3, y: 0.88, s: 1.6 }] }, speech: [{ who: 'pholia', text: "She got away... but she's gone. Come on, let's go HOME!" }] },
    ],
    [
      { scene: { bg: 'village', actors: [{ a: 'tommy', x: 0.55, y: 0.88, s: 1.6, pose: 'sit', f: -1 }, { a: 'gerald', x: 0.72, y: 0.88, s: 1.3 }] }, caption: 'Back in the cat village...', speech: [{ who: 'tommy', text: "Oh! Hi! I was still waiting here. This is Gerald. He's a rock." }] },
      { scene: { bg: 'village', actors: [{ a: 'pholia', x: 0.3, y: 0.88, s: 1.6, eyes: 'happy' }, { a: 'tommy', x: 0.6, y: 0.88, s: 1.6, f: -1, eyes: 'happy' }] }, speech: [{ who: 'pholia', text: "Tommy! You were here the WHOLE time?!" }, { who: 'tommy', text: "I said I was waiting here! Every single time!" }] },
    ],
    [
      { scene: { bg: 'village', actors: [{ a: 'confetti' }, { a: 'chalice', x: 0.12, y: 0.9, s: 1.3, pose: 'sit' }, { a: 'bobby', x: 0.27, y: 0.9, s: 1.3, pose: 'sit', eyes: 'happy' }, { a: 'pholia', x: 0.43, y: 0.9, s: 1.5, eyes: 'happy' }, { a: 'clyde', x: 0.58, y: 0.9, s: 1.3, f: -1, eyes: 'happy' }, { a: 'bandit', x: 0.73, y: 0.9, s: 1.3, f: -1, pose: 'sit' }, { a: 'tommy', x: 0.86, y: 0.9, s: 1.3, f: -1, eyes: 'happy' }, { a: 'gerald', x: 0.96, y: 0.92, s: 0.8 }] }, caption: 'Everyone is home! A celebration in the cat village!', speech: [{ who: 'bobby', text: "Final grade for the whole adventure: A-plus. ...Don't tell anyone I said that." }, { who: 'clyde', text: "Three cheers for Pholia! Mrow mrow MROW!" }] },
    ],
    [
      { scene: { bg: 'night', actors: [{ a: 'pholia', x: 0.5, y: 0.88, s: 1.6, pose: 'sit' }] }, caption: 'That night, as everyone napped...', speech: [] },
      { scene: { bg: 'cave', actors: [{ a: 'molequeen', x: 0.5, y: 0.85, s: 1.3 }] }, caption: '...somewhere far below...', speech: [{ who: 'molequeen', text: "Enjoy your nap, kitties. Because next time... I'm bringing my WHOLE family." }] },
    ],
  ];

  S.friends.flea = { name: 'The Giant Flea', color: '#8a4b2a', role: '' };
  S.friends.birdqueen = { name: 'The Bird Queen', color: '#8e5bc8', role: '' };
  S.friends.serpent = { name: 'The Serpent', color: '#4f8a3a', role: '' };
})();
