// All quiz content lives here. To reword a question or add an answer, edit this file only.
// Each answer carries the phrases the Character Brief and story premise are built from,
// so the results always read as full sentences.

export type Art =
  | { kind: 'emoji'; name: string }
  | { kind: 'toon'; style?: string; shape?: string; build?: string }
  | { kind: 'swatch'; colors: string[] };

export interface Option {
  id: string;
  label: string;
  blurb?: string;
  art?: Art;
  /** Text written into the Character Brief (falls back to label). */
  brief?: string;
  /** Extra sentence fragments used by the story premise and appearance line. */
  phrase?: string;
  /** Short tag for the "character so far" strip. */
  tag?: string;
}

export interface Part {
  id: string;
  kind: 'single' | 'multi' | 'text';
  label?: string;
  options?: Option[];
  layout?: 'cards' | 'list' | 'chips' | 'swatches';
  /** multi only */
  min?: number;
  max?: number;
  allowCustom?: boolean;
  customLabel?: string;
  /** Sentence stem shown before the custom text box. */
  customStem?: string;
  customPlaceholder?: string;
  optional?: boolean;
  maxLength?: number;
}

export interface Question {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  parts: Part[];
}

const e = (name: string): Art => ({ kind: 'emoji', name });

export const QUESTIONS: Question[] = [
  {
    id: 'room',
    eyebrow: 'First impressions',
    title: 'Your character walks into a room full of strangers. What happens?',
    subtitle: 'Go with your gut. You can change anything later.',
    parts: [
      {
        id: 'room',
        kind: 'single',
        layout: 'list',
        allowCustom: true,
        customLabel: 'Something else happens',
        customStem: 'They walk in and…',
        customPlaceholder: 'trip over a chair, then act like it was on purpose',
        options: [
          { id: 'spotlight', label: 'They’re the center of attention within thirty seconds.', art: e('glowing-star'), tag: 'Magnetic', brief: 'Magnetic and outgoing. Attention finds them whether they asked for it or not.' },
          { id: 'observer', label: 'They find a quiet corner and read the whole room.', art: e('eyes'), tag: 'Observant', brief: 'Quiet and observant. They notice the details everyone else walks past.' },
          { id: 'spark', label: 'They accidentally start an argument.', art: e('collision'), tag: 'Blunt', brief: 'Blunt and opinionated. They say the true thing at the worst possible moment.' },
          { id: 'wildcard', label: 'They start doing something nobody saw coming.', art: e('zany-face'), tag: 'Unpredictable', brief: 'Unpredictable and playful. They follow their own strange logic, and it usually works.' },
          { id: 'helper', label: 'They spot the one person who looks lost and go say hi.', art: e('handshake'), tag: 'Warm', brief: 'Warm and tuned in to other people. They are the first to notice who needs a friend.' },
          { id: 'snacks', label: 'They go straight to the snack table and avoid eye contact.', art: e('cookie'), tag: 'Awkward', brief: 'Awkward but easy to like. More comfortable with snacks than small talk.' },
        ],
      },
    ],
  },
  {
    id: 'type',
    eyebrow: 'The basics',
    title: 'What kind of being is your character?',
    subtitle: 'There’s no wrong answer. A toaster with opinions counts.',
    parts: [
      {
        id: 'type',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'A hybrid / something else',
        customStem: 'My character is…',
        customPlaceholder: 'a half-cat librarian, a cloud, a sentient skateboard',
        options: [
          { id: 'human', label: 'Human', blurb: 'A person. Any age, any look.', art: e('person'), phrase: 'human' },
          { id: 'animal', label: 'Animal or creature', blurb: 'Fur, feathers, scales, or all three.', art: e('fox'), brief: 'Animal or creature', phrase: 'animal-like creature' },
          { id: 'robot', label: 'Robot or machine', blurb: 'Built, programmed, possibly glitchy.', art: e('robot'), phrase: 'robot' },
          { id: 'monster', label: 'Monster or spirit', blurb: 'Spooky on paper. Maybe sweet in person.', art: e('ghost'), phrase: 'monster' },
          { id: 'alien', label: 'Alien', blurb: 'Not from around here.', art: e('alien'), phrase: 'alien' },
          { id: 'object', label: 'Living object', blurb: 'A lamp with feelings. A backpack with a grudge.', art: e('teapot'), phrase: 'living object' },
          { id: 'mythic', label: 'Mythical being', blurb: 'Dragons, giants, tricksters, and their cousins.', art: e('dragon'), phrase: 'mythical being' },
        ],
      },
    ],
  },
  {
    id: 'world',
    eyebrow: 'Location scout',
    title: 'Pick a world you’d want your character to live in.',
    parts: [
      {
        id: 'world',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'Somewhere else',
        customStem: 'My character lives in…',
        customPlaceholder: 'a city built on the back of a giant turtle',
        options: [
          { id: 'city', label: 'Modern city', blurb: 'Crowds, rooftops, late-night food.', art: e('cityscape'), phrase: 'a busy modern city' },
          { id: 'fantasy', label: 'Fantasy kingdom', blurb: 'Castles, quests, questionable wizards.', art: e('castle'), phrase: 'a fantasy kingdom' },
          { id: 'future', label: 'Futuristic world', blurb: 'Shiny tech with a few loose wires.', art: e('rocket'), phrase: 'a futuristic world' },
          { id: 'school', label: 'Ordinary school, unusual secrets', blurb: 'Looks normal. Is not normal.', art: e('school'), brief: 'An ordinary school with unusual secrets', phrase: 'an ordinary school that hides unusual secrets' },
          { id: 'wasteland', label: 'Post-apocalyptic wasteland', blurb: 'The world ended. Life kept going.', art: e('desert'), phrase: 'a post-apocalyptic wasteland' },
          { id: 'ocean', label: 'Hidden underwater world', blurb: 'Deep, glowing, mostly unexplored.', art: e('water-wave'), phrase: 'a hidden world deep underwater' },
          { id: 'town', label: 'Sleepy small town', blurb: 'Nothing ever happens here. Supposedly.', art: e('national-park'), phrase: 'a sleepy small town where nothing ever happens (supposedly)' },
        ],
      },
    ],
  },
  {
    id: 'genre',
    eyebrow: 'Now streaming',
    title: 'Your character’s show just dropped. Which row is it in?',
    parts: [
      {
        id: 'genre',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'A different genre',
        customStem: 'It’s a…',
        customPlaceholder: 'cooking-competition musical',
        options: [
          { id: 'comedy', label: 'Comedy', blurb: 'Things go wrong in the funniest way possible.', art: e('face-with-tears-of-joy'), phrase: 'Play it as a comedy, where every plan goes wrong in the funniest possible way.' },
          { id: 'action', label: 'Action-adventure', blurb: 'Chases, close calls, big finish.', art: e('crossed-swords'), phrase: 'Play it as an action-adventure, full of chases, close calls, and a big finish.' },
          { id: 'mystery', label: 'Mystery', blurb: 'Clues, twists, one huge reveal.', art: e('magnifying-glass-tilted-left'), phrase: 'Play it as a mystery, with clues, twists, and one big reveal.' },
          { id: 'slice', label: 'Slice of life', blurb: 'Small moments that end up mattering.', art: e('hot-beverage'), phrase: 'Play it as a slice-of-life story, where small everyday moments end up mattering most.' },
          { id: 'scifi', label: 'Sci-fi', blurb: 'Strange tech and bigger questions.', art: e('flying-saucer'), phrase: 'Play it as science fiction, with strange technology and even stranger consequences.' },
          { id: 'spooky', label: 'Spooky (but fun)', blurb: 'Creepy hallways, good laughs.', art: e('jack-o-lantern'), brief: 'Spooky but fun', phrase: 'Play it as a spooky-but-fun story, with more shivers and laughs than real scares.' },
          { id: 'drama', label: 'Heartfelt drama', blurb: 'The one that gets you at the end.', art: e('mending-heart'), phrase: 'Play it as a heartfelt drama that earns its ending.' },
        ],
      },
    ],
  },
  {
    id: 'strength',
    eyebrow: 'Crisis mode',
    title: 'Everything is going wrong at once. What does your character bring?',
    parts: [
      {
        id: 'strength',
        kind: 'single',
        layout: 'list',
        allowCustom: true,
        customLabel: 'Something else',
        customStem: 'Their biggest strength is…',
        customPlaceholder: 'remembering every tiny detail',
        options: [
          { id: 'plan', label: 'A plan. Somehow they always have a plan.', art: e('brain'), tag: 'Planner', brief: 'Strategic thinking. They stay organized when everything is chaos.', phrase: 'trust their talent for making a plan out of chaos' },
          { id: 'humor', label: 'A joke that actually makes things better.', art: e('performing-arts'), tag: 'Funny', brief: 'A sense of humor that lifts everyone around them.', phrase: 'lean on the sense of humor that keeps everyone going' },
          { id: 'courage', label: 'They run toward the problem.', art: e('fire'), tag: 'Brave', brief: 'Courage. They act while everyone else is frozen.', phrase: 'find the courage that makes them run toward trouble' },
          { id: 'invent', label: 'A strange invention made from whatever is nearby.', art: e('light-bulb'), tag: 'Inventive', brief: 'Creativity. They can build a solution out of scraps.', phrase: 'use their gift for building a solution out of scraps' },
          { id: 'heart', label: 'They keep everyone else calm.', art: e('red-heart'), tag: 'Caring', brief: 'Empathy. They understand what other people need.', phrase: 'rely on how well they understand other people' },
          { id: 'grit', label: 'They simply refuse to quit.', art: e('mountain'), tag: 'Determined', brief: 'Determination. Quitting is not in their vocabulary.', phrase: 'hold on to their refusal to quit' },
        ],
      },
    ],
  },
  {
    id: 'flaw',
    eyebrow: 'Nobody’s perfect',
    title: 'Your character has one major flaw. What is it?',
    subtitle: 'Flaws are what make a character interesting to watch.',
    parts: [
      {
        id: 'flaw',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'Something else',
        customStem: 'Their biggest weakness is…',
        customPlaceholder: 'never being on time',
        options: [
          { id: 'overconfident', label: 'Overconfidence', blurb: '“I’ve got this.” (They do not have this.)', art: e('crown'), phrase: 'admit they don’t have all the answers' },
          { id: 'failure', label: 'Fear of failure', blurb: 'If they never try, they can never lose.', art: e('anxious-face-with-sweat'), phrase: 'risk failing in front of everyone' },
          { id: 'impulsive', label: 'Impulsiveness', blurb: 'Act first. Think… eventually.', art: e('high-voltage'), phrase: 'learn to stop and think before they leap' },
          { id: 'jealous', label: 'Jealousy', blurb: 'Someone else always seems to have it easier.', art: e('green-heart'), phrase: 'stop measuring themselves against everyone else' },
          { id: 'trusting', label: 'Trusting people too easily', blurb: 'Believes the best about absolutely everyone.', art: e('pleading-face'), phrase: 'figure out who actually deserves their trust' },
          { id: 'loner', label: 'Refusing to ask for help', blurb: 'Would rather carry everything alone.', art: e('shield'), phrase: 'finally let someone else help' },
          { id: 'avoid', label: 'Putting off anything hard', blurb: 'Tomorrow. Definitely tomorrow.', art: e('snail'), phrase: 'stop avoiding the one thing that scares them' },
        ],
      },
    ],
  },
  {
    id: 'goal',
    eyebrow: 'The big want',
    title: 'What does your character want more than anything?',
    parts: [
      {
        id: 'goal',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'Something else',
        customStem: 'My character wants to…',
        customPlaceholder: 'open the best noodle shop in the galaxy',
        options: [
          { id: 'prove', label: 'To prove everyone wrong', blurb: 'People decided who they are. People were wrong.', art: e('trophy'), tag: 'Has something to prove', phrase: 'prove they are more than anyone expects' },
          { id: 'belong', label: 'To find where they belong', blurb: 'Somewhere, there’s a place that fits.', art: e('house'), tag: 'Looking for home', phrase: 'find a place where they truly belong' },
          { id: 'protect', label: 'To protect what they love', blurb: 'A person, a place, a very small plant.', art: e('seedling'), tag: 'Protector', phrase: 'protect what they care about most' },
          { id: 'truth', label: 'To uncover a secret', blurb: 'Something doesn’t add up.', art: e('key'), tag: 'Truth-seeker', phrase: 'uncover the truth behind a secret no one will talk about' },
          { id: 'explore', label: 'To see what’s out there', blurb: 'Home is nice. The horizon is nicer.', art: e('compass'), tag: 'Explorer', phrase: 'leave home and find out what else is out there' },
          { id: 'fix', label: 'To fix a mistake', blurb: 'One bad day they can’t stop replaying.', art: e('adhesive-bandage'), tag: 'Making it right', phrase: 'undo a mistake they can’t stop thinking about' },
          { id: 'best', label: 'To be the best at one thing', blurb: 'Not good. The best.', art: e('sports-medal'), tag: 'Chasing greatness', phrase: 'become the very best at the one thing they love' },
        ],
      },
    ],
  },
  {
    id: 'obstacle',
    eyebrow: 'Plot twist',
    title: 'Of course it isn’t that easy. What’s standing in the way?',
    subtitle: 'Every good story needs a problem.',
    parts: [
      {
        id: 'obstacle',
        kind: 'single',
        layout: 'list',
        allowCustom: true,
        customLabel: 'A different problem',
        customStem: 'What stands in the way is…',
        customPlaceholder: 'a very organized flock of pigeons',
        options: [
          { id: 'rival', label: 'A rival who is annoyingly good at everything.', art: e('vs-button'), tag: 'vs. a rival', brief: 'A rival who seems better at everything', phrase: 'a rival who seems better at everything' },
          { id: 'secret', label: 'A secret that absolutely cannot get out.', art: e('locked'), tag: 'vs. a secret', brief: 'A secret they are desperate to keep hidden', phrase: 'a secret they are desperate to keep hidden' },
          { id: 'rules', label: 'Someone in charge who keeps saying no.', art: e('stop-sign'), tag: 'vs. the rules', brief: 'A powerful authority figure who keeps saying no', phrase: 'a powerful authority figure who keeps saying no' },
          { id: 'doubt', label: 'Their own self-doubt.', art: e('thought-balloon'), tag: 'vs. self-doubt', brief: 'Their own self-doubt', phrase: 'their own self-doubt' },
          { id: 'clock', label: 'A deadline that’s coming way too fast.', art: e('hourglass-not-done'), tag: 'vs. the clock', brief: 'A deadline that is coming far too fast', phrase: 'a deadline that is coming far too fast' },
          { id: 'friend', label: 'A friendship that’s falling apart.', art: e('broken-heart'), tag: 'vs. a friend', brief: 'A falling-out with their closest friend', phrase: 'a falling-out with their closest friend' },
          { id: 'force', label: 'A strange force nobody understands.', art: e('cyclone'), tag: 'vs. the unknown', brief: 'A strange force that nobody fully understands', phrase: 'a strange force that nobody fully understands' },
        ],
      },
    ],
  },
  {
    id: 'style',
    eyebrow: 'Art direction',
    title: 'Which art style feels right for this character?',
    subtitle: 'Same little character, six different styles.',
    parts: [
      {
        id: 'style',
        kind: 'single',
        layout: 'cards',
        allowCustom: true,
        customLabel: 'A different style',
        customStem: 'The style I’m picturing is…',
        customPlaceholder: 'paper cut-outs, pixel art, chalk drawings',
        options: [
          { id: 'bouncy', label: 'Bouncy classic', blurb: 'Rubbery limbs and big oval eyes.', art: { kind: 'toon', style: 'bouncy' }, phrase: 'Bouncy classic cartoon style with rubbery limbs and simple rounded forms' },
          { id: 'flat', label: 'Bold and flat', blurb: 'Thick outlines, simple shapes, flat color.', art: { kind: 'toon', style: 'flat' }, phrase: 'Bold, flat modern cartoon style with thick outlines and simple shapes' },
          { id: 'anime', label: 'Anime-inspired', blurb: 'Expressive eyes and sharp hair.', art: { kind: 'toon', style: 'anime' }, phrase: 'Anime-inspired cartoon style with large expressive eyes and sharp, graphic hair' },
          { id: 'cute', label: 'Chunky and cute', blurb: 'Big head, tiny body, maximum charm.', art: { kind: 'toon', style: 'cute' }, phrase: 'Chunky, cute style with a big head and a small, simple body' },
          { id: 'angular', label: 'Sharp and edgy', blurb: 'Angles, points, and attitude.', art: { kind: 'toon', style: 'angular' }, phrase: 'Sharp, angular cartoon style built from points and hard edges' },
          { id: 'storybook', label: 'Sketchy storybook', blurb: 'Loose, wobbly lines like a picture book.', art: { kind: 'toon', style: 'storybook' }, phrase: 'Sketchy storybook style with loose, hand-drawn lines' },
        ],
      },
    ],
  },
  {
    id: 'body',
    eyebrow: 'Silhouette test',
    title: 'If you only saw their shadow, what would you notice?',
    subtitle: 'Animators call this shape language. Pick a main shape, then a build.',
    parts: [
      {
        id: 'shape',
        kind: 'single',
        layout: 'cards',
        label: 'Main shape',
        options: [
          { id: 'circle', label: 'Circles and curves', blurb: 'Reads as friendly and soft.', art: { kind: 'toon', shape: 'circle' }, phrase: 'Mostly circles and soft curves, which read as friendly and approachable' },
          { id: 'square', label: 'Squares and blocks', blurb: 'Reads as sturdy and dependable.', art: { kind: 'toon', shape: 'square' }, phrase: 'Mostly squares and blocky forms, which read as sturdy and dependable' },
          { id: 'triangle', label: 'Triangles and points', blurb: 'Reads as energetic or dangerous.', art: { kind: 'toon', shape: 'triangle' }, phrase: 'Mostly triangles and sharp points, which read as energetic and a little dangerous' },
          { id: 'mix', label: 'A mix, on purpose', blurb: 'Contrast makes people look twice.', art: { kind: 'toon', shape: 'mix' }, phrase: 'A deliberate mix of round, square, and pointed shapes for contrast' },
        ],
      },
      {
        id: 'build',
        kind: 'single',
        layout: 'cards',
        label: 'Build',
        options: [
          { id: 'tiny', label: 'Small and compact', art: { kind: 'toon', build: 'tiny' }, phrase: 'small and compact' },
          { id: 'lanky', label: 'Tall and lanky', art: { kind: 'toon', build: 'lanky' }, phrase: 'tall and lanky' },
          { id: 'broad', label: 'Big and broad', art: { kind: 'toon', build: 'broad' }, phrase: 'big and broad' },
          { id: 'bighead', label: 'Big head, small body', art: { kind: 'toon', build: 'bighead' }, phrase: 'big-headed and small-bodied' },
          { id: 'pear', label: 'Small top, wide base', art: { kind: 'toon', build: 'pear' }, phrase: 'narrow on top with a wide base' },
          { id: 'average', label: 'Right in the middle', art: { kind: 'toon', build: 'average' }, phrase: 'medium-sized, with balanced proportions' },
        ],
      },
    ],
  },
  {
    id: 'features',
    eyebrow: 'Spot them in a crowd',
    title: 'Pick exactly two things people always notice first.',
    subtitle: 'Great cartoon characters are recognizable from across the street. Add your own if you like.',
    parts: [
      {
        id: 'features',
        kind: 'multi',
        layout: 'chips',
        min: 2,
        max: 2,
        allowCustom: true,
        customLabel: 'Add your own',
        customPlaceholder: 'a pet snail on one shoulder',
        options: [
          { id: 'hair', label: 'Hair (or fur) that defies gravity' },
          { id: 'goggles', label: 'Goggles pushed up on their head' },
          { id: 'scarf', label: 'A scarf that is far too long' },
          { id: 'glasses', label: 'Glasses too big for their face' },
          { id: 'shoes', label: 'Mismatched shoes' },
          { id: 'jacket', label: 'A patched-up jacket' },
          { id: 'tail', label: 'A tail with a mind of its own' },
          { id: 'ears', label: 'Ears that give away every emotion' },
          { id: 'hat', label: 'A hat they never take off' },
          { id: 'backpack', label: 'A backpack bigger than they are' },
          { id: 'mark', label: 'A glowing mark or symbol' },
          { id: 'tooth', label: 'One snaggle tooth' },
          { id: 'arm', label: 'A mechanical arm or leg' },
          { id: 'spots', label: 'Freckles, spots, or stripes' },
          { id: 'antennae', label: 'Antennae' },
          { id: 'cape', label: 'A cape (it’s actually a blanket)' },
          { id: 'brows', label: 'Eyebrows that do most of the acting' },
          { id: 'headphones', label: 'Headphones around their neck' },
        ],
      },
    ],
  },
  {
    id: 'palette',
    eyebrow: 'Color script',
    title: 'Which colors feel like your character?',
    subtitle: 'This is a starting palette. You’ll fine-tune it in Harmony.',
    parts: [
      {
        id: 'palette',
        kind: 'single',
        layout: 'swatches',
        allowCustom: true,
        customLabel: 'My own colors',
        customStem: 'Their colors are…',
        customPlaceholder: 'sky blue, orange, and a little bit of silver',
        options: [
          { id: 'sunset', label: 'Sunset Pop', brief: 'Sunset Pop: coral, golden yellow, deep violet, and cream', art: { kind: 'swatch', colors: ['#FF6B5E', '#FFC145', '#5B3A8C', '#FFF4E0'] } },
          { id: 'ocean', label: 'Ocean Arcade', brief: 'Ocean Arcade: teal, electric blue, deep navy, and seafoam', art: { kind: 'swatch', colors: ['#12B5A6', '#2D7FF9', '#12294F', '#BFF3E4'] } },
          { id: 'forest', label: 'Forest Trail', brief: 'Forest Trail: moss green, pine, warm brown, and mustard', art: { kind: 'swatch', colors: ['#7FA650', '#2F5D43', '#8A5A3C', '#E3B341'] } },
          { id: 'candy', label: 'Candy Static', brief: 'Candy Static: hot pink, lavender, mint, and lemon', art: { kind: 'swatch', colors: ['#FF5FA2', '#B79CED', '#8EE3C8', '#FFE66D'] } },
          { id: 'neon', label: 'Midnight Neon', brief: 'Midnight Neon: near-black navy, neon green, magenta, and cyan', art: { kind: 'swatch', colors: ['#141B34', '#5CFF8F', '#F23DB3', '#35D9F5'] } },
          { id: 'vintage', label: 'Dusty Vintage', brief: 'Dusty Vintage: rust, mustard, olive, and faded teal', art: { kind: 'swatch', colors: ['#C1502E', '#D9A441', '#7C8046', '#5E9C97'] } },
          { id: 'mono', label: 'Grayscale + One Pop', brief: 'Grayscale + One Pop: black, gray, white, and a single bright red accent', art: { kind: 'swatch', colors: ['#1E1E24', '#8C8F99', '#F2F2F2', '#F03A3A'] } },
          { id: 'spirit', label: 'Blue and Gold', brief: 'Blue and Gold: royal blue, gold, navy, and white', art: { kind: 'swatch', colors: ['#1F5FD1', '#F5B81C', '#0B1F4B', '#FFFFFF'] } },
        ],
      },
    ],
  },
  {
    id: 'name',
    eyebrow: 'Last one',
    title: 'Every character needs a name.',
    subtitle: 'Stuck? Hit “Surprise me” until one feels right.',
    parts: [
      {
        id: 'name',
        kind: 'text',
        label: 'My character’s name is',
        customPlaceholder: 'Type a name',
        maxLength: 40,
      },
      {
        id: 'item',
        kind: 'text',
        label: 'They never leave home without (optional)',
        customPlaceholder: 'a lucky bottle cap',
        optional: true,
        maxLength: 80,
      },
    ],
  },
];

export const PARTS: Record<string, Part> = Object.fromEntries(
  QUESTIONS.flatMap((q) => q.parts.map((p) => [p.id, p])),
);

export const NAME_IDEAS: Record<string, string[]> = {
  robot: ['Sprocket', 'Bolt', 'Pixel', 'Widget', 'Dot', 'Ratchet', 'Byte'],
  animal: ['Biscuit', 'Bramble', 'Pounce', 'Thistle', 'Mango', 'Pepper', 'Wren'],
  monster: ['Grumble', 'Murk', 'Fang', 'Shiver', 'Boggle', 'Moth'],
  alien: ['Zib', 'Quorra', 'Nebb', 'Oxo', 'Vexi', 'Lumo'],
  object: ['Clink', 'Button', 'Tassel', 'Wick', 'Zipper', 'Spoon'],
  mythic: ['Ember', 'Cinder', 'Rune', 'Gale', 'Thorn', 'Fable'],
  any: ['Pip', 'Juno', 'Moxie', 'Ziggy', 'Nova', 'Fig', 'Echo', 'Rook', 'Marlow', 'Onyx', 'Quill', 'Dash', 'Indigo', 'Sable', 'Kit', 'Zephyr'],
};
