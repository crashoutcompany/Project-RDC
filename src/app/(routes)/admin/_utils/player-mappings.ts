import z from "zod";
import { playerSchema } from "./form-helpers";

export class PlayerNotFoundError extends Error {
  constructor(playerName: string) {
    super(`Player not found: ${playerName}`);
    this.name = "PlayerNotFoundError";
  }
}

type PlayerMapping = {
  [key in z.infer<typeof playerSchema>["playerName"]]: {
    playerId: number;
    playerName: string;
    aliases: string[];
    gamerTags: string[];
    image: string;
    nav: { alt: string; name: string; url: string; src: string };
    desc: string;
    stats: { prop: string; val: string }[];
  };
};

export const PLAYER_MAPPINGS: PlayerMapping & {} = {
  Mark: {
    playerId: 1,
    playerName: "Mark",
    aliases: ["mark", "mk"],
    gamerTags: [
      "SupremeMvp0020",
      "SupremeMvp 0020",
      "Mark",
      "SupremeMvp0020#4772468",
      "SupremeMVP",
    ],
    image: "/images/mark_rdc.jpg",
    nav: {
      alt: "RDC Mark",
      name: "Cash Money Mawk",
      url: "/members/mark",
      src: "/images/mark_rdc.jpg",
    },
    desc: "Director, animator, Mark is the founder and creator of RDC. He is one of the better gamers in RDC and plays as such.",
    stats: [
      { prop: "Best Rocket League Player", val: "#1" },
      { prop: "Dragon Ball Sparking Zero", val: "#2" },
      { prop: "Scariest Gamer", val: "Most deaths in Lethal Company" },
    ],
  },
  Dylan: {
    playerId: 2,
    playerName: "Dylan",
    aliases: ["dylan", "dyl", "dpatel"],
    gamerTags: [
      "Dpatel254",
      "Opatel254",
      "L. Opatel254",
      "Dylan",
      "RdcDylan#2869564",
      "RdcDylan",
      "RdcDylann",
      "Hindu254",
    ],
    image: "/images/dylan_rdc.jpg",
    nav: {
      alt: "RDC Dylan",
      name: "The Big Dyl",
      src: "/images/dylan_rdc.jpg",
      url: "/members/dylan",
    },
    desc: "The tech guru, the thriller in manilla, el luchador. Dylan is a huge component in the puzzle that is RDC. The flawless streams are thanks to Dylan. He is one of the top gamers in the group although recently he has been falling lower in the ranking of rdc members.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  Ben: {
    playerId: 3,
    playerName: "Ben",
    aliases: ["ben", "benny"],
    gamerTags: ["Jabenixem", "Ben", "Ben-San", "Ben Negative 10"],
    image: "/images/ben_rdc.jpg",
    nav: {
      alt: "RDC Ben",
      name: "LaBen James",
      url: "/members/ben",
      src: "/images/ben_rdc.jpg",
    },
    desc: "Ben is a very average gamer. Somethings he is good at and other's hes not. It's hard to explain. Ben gets it done. He works well and if he leaves again he's dead to us.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  Lee: {
    playerId: 4,
    playerName: "Lee",
    aliases: ["lee", "leland"],
    gamerTags: [
      "Leland12123",
      "Leland23",
      "Leland",
      "Lee",
      "MysticLeland#1739668",
      "MysticLeland",
      "XxYungStarxX",
    ],
    image: "/images/leland_rdc.jpg",
    nav: {
      alt: "RDC Leland",
      name: "Meland",
      url: "/members/lee",
      src: "/images/leland_rdc.jpg",
    },
    desc: "I love it when you talk to me, my cash machine, my cash machine. The old man laugh always get us. While Leland is really sorry at most games, don't try to play him in any fighting game. You are most likely to get beat up.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  Des: {
    playerId: 5,
    playerName: "Des",
    aliases: ["des", "desmond"],
    gamerTags: [
      "13RUTALxPANIiC",
      "13RUTALxPANIC",
      "IBRUTALxPANIiC",
      "IBRUTALXPANIIC",
      "Desmond",
      "Des",
      "Des#5052521",
      "DesmondJ",
    ],
    image: "/images/desmond_rdc.jpg",
    nav: {
      alt: "RDC Des",
      name: "Old Man Des",
      url: "/members/des",
      src: "/images/desmond_rdc.jpg",
    },
    desc: "How greeeeeeeat is our God. Ranking as the 2nd best singer in RDC Desmond is surprisingly a very good gamer. You would think the dementia would affect Des but the rage and enthusiasm he plays with always uplifts him in the end. Also Desmond, how is Crystal?",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  John: {
    playerId: 6,
    playerName: "John",
    aliases: ["john"],
    gamerTags: ["I will never forget that day in Lockdown..."],
    image: "/images/john_rdc.jpg",
    nav: {
      alt: "RDC John",
      name: "J.O.H.N.",
      url: "/members/john",
      src: "/images/john_rdc.jpg",
    },
    desc: "If you've ever seen or been to DreamCon, this man has had a hand in it. Don't let his sorry gaming skills fool you, John is very valuable in the backend and his contributions should not go unnoticed. Don't forget his immaculate singing ability, John is clearly the best singer in RDC.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  Aff: {
    playerId: 7,
    playerName: "Aff",
    aliases: ["aff"],
    gamerTags: ["Aff"],
    image: "/images/aff_rdc.jpg",
    nav: {
      alt: "RDC Aff",
      name: "Aff",
      url: "/members/aff",
      src: "/images/aff_rdc.jpg",
    },
    desc: "Aff and his turtle bring a lot to RDC. Give aff for giving us all the laughs, memes, and behind the scenes work that he contributes to.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
  Ipi: {
    playerId: 8,
    playerName: "Ipi",
    aliases: ["ipi"],
    gamerTags: ["iceman_ip"],
    image: "/images/ipi_rdc.jpg",
    nav: {
      alt: "Ipi",
      name: "Iceman Ip",
      url: "/members/ipi",
      src: "/images/ipi_rdc.jpg",
    },
    desc: "Ipi is a newcomer in the eyes of RDC, while not yet an official member of RDC yet, one can assume that it's only a matter of time as he has been beating down the crew in Golf and Mario Kart.",
    stats: [
      { prop: "", val: "" },
      { prop: "", val: "" },
      { prop: "", val: "" },
    ],
  },
} as const;

export const findPlayer = (searchTerm: string) => {
  const lowerCasePlayer = searchTerm.toLowerCase();
  for (const playerName in PLAYER_MAPPINGS) {
    const player = PLAYER_MAPPINGS[playerName as keyof PlayerMapping];
    if (
      player.playerName.toLowerCase() === lowerCasePlayer ||
      player.aliases.some((alias) => alias.toLowerCase() === lowerCasePlayer) ||
      player.gamerTags.some((tag) => tag.toLowerCase() === lowerCasePlayer)
    ) {
      return player;
    }
  }
  return undefined;
};
