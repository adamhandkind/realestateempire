import type { PostOutcome } from '../state/types'

/** postId -> { neutral, viral, embarrass } (§8). */
export const POST_LINES: Record<string, Record<PostOutcome, string>> = {
  marketUpdate: {
    neutral:
      'You posted the market update. Fourteen people saved it. Two understood it.',
    viral:
      'Your market graph got shared by an actual economist (ironically, but still). Reputation up.',
    embarrass:
      "You mislabeled the axes. A mortgage broker commented 'is this backwards?' It was.",
  },
  justListed: {
    neutral:
      'Just-listed post is up. The sky in the photo is a colour the sky has never been.',
    viral:
      "The listing post blew up — someone's cousin is now pre-approved and calling you.",
    embarrass:
      "You forgot to remove the previous agent's sign from the photo. People noticed. People always notice.",
  },
  motivational: {
    neutral: 'Your monologue posted. It is 47 seconds long. It feels longer.',
    viral:
      "The monologue hit. Somehow it hit. 200k views and a lead who calls you 'coach.'",
    embarrass:
      "A stitch of your monologue captioned 'not him thinking he's him' has more views than the original.",
  },
  familyAuthenticity: {
    neutral:
      'The family post is up. Warm. Genuine. The family is from a stock library, but the feeling is real.',
    viral:
      'The authenticity post resonated hard. Rep way up. Ruth-types are in your DMs.',
    embarrass:
      "Someone reverse-image-searched the 'family.' They found the stock listing. They posted it. Under yours.",
  },
  fakeCandid: {
    neutral:
      'The candid coffee shot posted. You have never looked so naturally caught off guard.',
    viral:
      'The coffee shot did numbers. A cafe wants to collab. You are now a lifestyle brand.',
    embarrass:
      "The 'candid' photo still had the photographer's reflection in the window. Everyone saw Kyle.",
  },
  luxuryCar: {
    neutral:
      "The car post is up. You captioned it 'grateful.' The lease is for 72 months.",
    viral:
      'The car post popped off. Cash-buyer types respect it. One wants to buy a house AND the car.',
    embarrass:
      'Someone found the dealer plate frame. The car is rented by the week. The comments are a crime scene.',
  },
  justListedVideo: {
    neutral:
      'The listing video posted. The drone shot of the driveway is genuinely beautiful.',
    viral:
      'The video went wide — three serious buyers and a relocation lead in one night. This is what a crew is for.',
    embarrass:
      "The bass drop landed on a photo of the septic tank. The edit cannot be unseen. Kyle is 'so sorry.'",
  },
  dancingTour: {
    neutral:
      'The dancing tour posted. The commitment is undeniable. The bedrooms are, too.',
    viral:
      "THE DANCE WENT VIRAL. 900k views. The house sold to someone who 'just had to have the dancing house.' Legend.",
    embarrass:
      'You slipped on the hardwood mid-tour and the clip is now a sound other people dance to. You are a meme. Not the good kind.',
  },
  humbledAward: {
    neutral:
      "The humbled post is up. It is 400 words. The word 'humbled' appears four times.",
    viral:
      'The gratitude post struck a chord — genuine engagement, genuine leads, genuinely humbled (finally).',
    embarrass:
      "You posted 'I'm humbled' next to a trophy for Most Improved Signage. The ratio is educational.",
  },
}

/** §10 Awards guard: appended to humbledAward's NEUTRAL line when a trophy is displayed. */
export const HUMBLED_TROPHY_SUFFIX = ' (the trophy is real, at least)'

export const VIRAL_BANNER = '📈 IT WENT VIRAL.' // §8.2
export const EMBARRASS_BANNER = '💀 IT DID NOT GO WELL.' // §8.3

/** §6.7 skip-streak decay line. */
export const SKIP_DECAY_LINE =
  'Third quiet week online. The algorithm has begun to forget your face.'

/** §11 migration line. */
export const CONTENT_MIGRATION_LINE =
  "You've decided to 'start posting more.' God help everyone."

/** §8.5 — joins the brag rotation after the player's first viral. */
export const CONTENT_BRAGS = [
  'Went viral again. Anyway. As I was saying. 📈',
  'Some of you found me through the dancing tour. Welcome. Stay for the comps.',
  "The content isn't the brand. I'm the brand. The content is just proof.",
]
