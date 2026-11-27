// ============================================================
//  STORY & DIALOGUE — edit any text here.
// ============================================================
PM.STORY = {
  friends: {
    clyde: { name: 'Clyde', color: '#f0a04b', role: 'Boss expert' },
    bobby: { name: 'Bobby', color: '#a89a86', role: 'Professional critic' },
    bandit: { name: 'Bandit', color: '#3b3533', role: 'Item know-it-all' },
    tommy: { name: 'Tommy', color: '#c8702e', role: 'Waiting' },
    chalice: { name: 'Chalice', color: '#1d1a1c', role: 'Shopkeeper' },
    pholia: { name: 'Pholia', color: '#e8893a', role: 'You!' },
  },

  // Bandit explains things the first time Pholia meets them
  bandit: {
    coin: "Bandit here. Those shiny paw-print coins? Chalice takes them at her shop. She does NOT take IOUs. I tried.",
    feather: "Bandit again. That's a FEATHER. Press Y to use it — it'll tickle your nose and you'll sneeze so hard you run super fast for 20 seconds.",
    spring: "Ooh, a SPRING! Press Y and you'll be able to jump again in mid-air for 20 seconds. Cats aren't supposed to do that. Don't tell anyone.",
    puff: "A PUFF BALL! It looks cute but it EXPLODES. Hold I to wind up, let go to throw it. Bigger wind-up, farther throw.",
    sludge: "Careful with that green sewer sludge. It won't take a life, but it stings, and it'll smell for WEEKS.",
    spikes: "Rusty nails! Even with nine lives, don't step on those.",
    crumble: "Those wooden boards are rotten — they'll crumble a moment after you land on them. Keep moving!",
    breakable: "See that cracked brick? A good paw swipe (U) might knock it down. Who knows what's behind it...",
    life: "WAIT. Is that a GOLDEN BELL?! Those are super rare — it gives you back one of your nine lives!",
    moving: "Moving platforms ahead. Ride 'em like a fancy cat on a fancy elevator.",
    roach: "Roaches! They're quick little things. A paw swipe or a pounce on top does the trick.",
    rat: "Tiny rats! They work for the Rat King. Pounce on them or swipe them with U. They sometimes drop coins and power-ups!",
    bigrat: "That's a chunky rat. It takes two hits. Maybe three if it had a big lunch.",
    drip: "Watch out for the dripping pipes. That sludge drips on a schedule — time your run!",
    trap: "A RAT TRAP! It's in your paws now. Hold I and let go to throw it. Wait until the Rat King is dizzy!",
    ratdizzy: "He's seeing stars! NOW — throw the trap at him!",
    hat: "A hat from Chalice gives you an extra ARMOR heart — it's the blue one. Fashion AND protection!",
  },

  // Clyde explains boss & mini-boss fights
  clyde: {
    digby_pre: "Clyde here! I'm hearing a DRILL up ahead. That's one of the Mole Queen's workers — Foreman Digby. He charges with his drill and gets stuck in the wall. When he's stuck, SWIPE him! Jump on his hard hat when he's not charging.",
    ratking_pre: "Clyde again. Okay, listen up. The Rat King is big, but he's not bright. He'll chase you around, then crouch and wiggle — that means he's about to RAM. Dodge so he bonks into the wall and gets dizzy. Then pick up a rat trap and THROW it at him (hold I, let go)!",
    ratking_p2: "The next trap is up on the left ledge! Grab it, and watch out for his little rat buddies!",
    ratking_p3: "Last trap is on the RIGHT ledge. He rams twice in a row now, and he won't stay dizzy as long. Be quick!",
  },

  // Tommy's lines get sillier as the game goes on (one per level, in order)
  tommy: [
    "Tommy here. Still waiting here.",
    "Still waiting.",
    "Still waiting here. Just so you know.",
    "Pholia? It's Tommy. I'm still waiting.",
    "Still waiting. I found a nice rock to sit on.",
    "Still waiting. I've named the rock Gerald.",
    "Gerald and I are still waiting.",
    "Still waiting. Gerald says hi.",
    "Hey Pholia, quick question: are you almost here? ...Okay. Still waiting.",
    "Still waiting. Gerald and I have started a book club.",
    "Still waiting. The book club has 2 members. We're very exclusive.",
    "Still waiting. Gerald finished the book before me. Show-off.",
  ],

  // Bobby rates every level. {grade} lines.
  bobby: {
    S: [
      "Okay... FINE. That was actually amazing. Don't let it go to your head.",
      "Flawless. I'm almost impressed. Almost.",
      "Wow. Did you practice? Be honest. You practiced.",
    ],
    A: [
      "Not bad! I'd give it an A. I don't give A's to just anybody, sweetie.",
      "Pretty good. You only looked silly a LITTLE bit.",
      "Solid work. I've seen better. I've also seen way worse.",
    ],
    B: [
      "A B. Like a bee. Buzzing around, missing coins.",
      "Mid. Very mid. Aggressively mid.",
      "You got through it. That's... technically the goal.",
    ],
    C: [
      "Oh honey. Oh no. Oh honey.",
      "Was that a speedrun of getting hurt?",
      "I'm giving you a C for 'Cat, please.'",
      "My grandma could do better, and she naps 20 hours a day.",
    ],
  },

  // Tutorial signs in level 1
  signs: [
    "Use A / D or the ← / → arrows to walk!",
    "Press W, ↑ or SPACE to jump. Hold it to jump higher!",
    "Press S or ↓ to duck. Duck to squeeze under low pipes!",
    "Press U to swipe with your paw. Try it on this crate!",
    "Press K or SHIFT to dash. Dashing in the air helps cross big gaps!",
    "Your walkie-talkie flashes BLUE when a friend calls. Press Q or TAB to answer!",
    "Press ESC any time to pause and see all the controls.",
    "Falling down a pit costs a life. You have 9 — be careful!",
  ],

  // Pre-level radio chatter (by level number). Optional.
  levelStart: {
    1: [{ from: 'bandit', text: "Pholia?! It's Bandit! Is this thing on? We all fell into different holes when the ground shook. You're in the SEWER. Walk to the right and find a way back up!" }],
    2: [{ from: 'bobby', text: "Bobby here. I'll be grading your performance at the end of every level. You're welcome." }],
    3: [{ from: 'clyde', text: "Clyde here! I'm stuck somewhere in this sewer too. I can hear something big and squeaky nearby... Keep coming!" }],
    6: [{ from: 'clyde', text: "The squeaking is getting LOUDER. I think I'm in some kind of cage. Hurry, Pholia!" }],
    9: [{ from: 'bandit', text: "One more level until the big squeaker. Chalice said she'll see you after the next biome's mini-boss. She also said 'no refunds.'" }],
  },

  shop: {
    greet: "Well, well. A customer. I'm Chalice. Coins for goods, no haggling, no refunds, no belly rubs.",
    buy: ["Pleasure doing business.", "Excellent choice. Obviously.", "Mrow. Sold.", "Spend wisely. Or don't. I still get paid."],
    poor: "You can't afford that, sweetie. Go swipe some more rats.",
    full: "Your paws are already full. One item at a time.",
    healed: "Already full of hearts. You're welcome to buy it anyway, though.",
    bye: "Come back next biome. I'll be there. I'm always there.",
    hatOwned: "You're already wearing it. It looks great, by the way.",
  },

  // Comic cutscenes: each page has 1-3 panels. Each panel has a scene painter
  // (see js/cutscene.js), an optional caption, and speech bubbles.
  cutscenes: {
    intro: [
      [
        { scene: 'village', caption: 'The cat village. A perfectly lazy afternoon.', speech: [{ who: 'tommy', text: "Nap time is my favorite time." }] },
        { scene: 'village2', speech: [{ who: 'bobby', text: "Every time is your favorite time, Tommy." }, { who: 'pholia', text: "Mrrp! Who wants to chase the red dot?" }] },
      ],
      [
        { scene: 'quake', caption: 'Then... RUMBLE.', speech: [{ who: 'clyde', text: "Uh, guys? Is the ground supposed to wiggle?" }] },
        { scene: 'fall', caption: 'The ground cracked open and everyone fell!', speech: [{ who: 'pholia', text: "AAAAAHHH!" }] },
      ],
      [
        { scene: 'moleScreen', caption: 'Meanwhile, deep underground...', speech: [{ who: 'molequeen', text: "Hehehe. Phase one complete. Rat King! Make sure the calico never comes back up." }, { who: 'ratking', text: "Duh... okay boss!" }] },
      ],
      [
        { scene: 'sewerWake', caption: 'Somewhere in the sewer...', speech: [{ who: 'pholia', text: "Ow... where am I? Everyone? Hello?" }] },
        { scene: 'walkie', speech: [{ who: 'bandit', text: "*kzzzt* Pholia! Use the walkie-talkie! We've all got one! *kzzt*" }, { who: 'pholia', text: "I'm coming for you guys. All of you!" }] },
      ],
    ],
    ratking_defeated: [
      [
        { scene: 'ratKingDown', caption: 'The Rat King is defeated!', speech: [{ who: 'ratking', text: "My crown... it's crooked... I need a nap..." }] },
        { scene: 'clydeCage', speech: [{ who: 'clyde', text: "Pholia!! You did it! Now get me out of this cheese-smelling cage!" }] },
      ],
      [
        { scene: 'clydeFree', caption: 'Clyde is free!', speech: [{ who: 'clyde', text: "I'm sticking with you. I know a LOT about big scary things." }, { who: 'pholia', text: "Welcome to the team, Clyde!" }] },
        { scene: 'moleScreen', caption: 'Meanwhile...', speech: [{ who: 'molequeen', text: "The Rat King FAILED?! Hmph. Giant Flea... it's your turn." }] },
      ],
      [
        { scene: 'toWasteland', caption: 'A pipe leads up and out... into the dusty Wasteland.', speech: [{ who: 'tommy', text: "*kzzt* ...still waiting here." }] },
      ],
    ],
  },
};
