import { Standup } from '../models/standup.models';

/** Plain text for pasting into Slack / Teams (*bold* and _italic_ render in both). */
export function standupToText(standup: Standup, dateLabel: string): string {
  const bullets = (lines: string[], empty: string) => (lines.length ? lines.map(line => `• ${line}`) : [`• ${empty}`]);
  const notFinished = standup.planReview.filter(item => !item.done).map(item => item.text);

  return [
    `*Standup: ${standup.member.name}, ${dateLabel}*`,
    '',
    '*Yesterday*',
    ...bullets([...standup.yesterday.map(work => work.summary), ...standup.notes], 'Nothing recorded'),
    ...(notFinished.length ? [`_Not finished:_ ${notFinished.join(', ')}`] : []),
    '',
    '*Today*',
    ...bullets(standup.today.map(item => item.text), 'Nothing planned yet'),
    '',
    '*Blockers*',
    ...bullets(standup.blockers, 'None'),
    ...(standup.resolvedBlockers.length ? [`_Resolved:_ ${standup.resolvedBlockers.join(', ')}`] : [])
  ].join('\n');
}
