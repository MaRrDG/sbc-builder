// Slash commands registered by setup (guild commands, full replace = idempotent).
import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type SlashCommandStringOption, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { POLL_ANSWER_MAX, POLL_ANSWERS_MAX, POLL_HOURS_MAX, POLL_QUESTION_MAX } from './poll.js';

const answer = (n: number, required: boolean) => (o: SlashCommandStringOption) =>
  o.setName(`answer${n}`).setDescription(`Answer ${n}`).setDescriptionLocalizations({ ro: `Răspunsul ${n}` }).setRequired(required).setMaxLength(POLL_ANSWER_MAX);

export const COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName('sbc')
    .setDescription('Cheapest squad from your club for an SBC (posted in the channel)')
    .setDescriptionLocalizations({ ro: 'Cel mai ieftin lot din clubul tău pentru un SBC (postat în canal)' })
    .addIntegerOption((o) => o.setName('set').setDescription('SBC').setDescriptionLocalizations({ ro: 'SBC' }).setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) =>
      o.setName('challenge').setDescription('Challenge (default: the first one not done)').setDescriptionLocalizations({ ro: 'Challenge (implicit: primul nefăcut)' }).setAutocomplete(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Your FC Solver stats: SBCs, objectives, club')
    .setDescriptionLocalizations({ ro: 'Statisticile tale FC Solver: SBC-uri, obiective, club' })
    .toJSON(),
  pollCommand(),
];

// Admin / Moderator only: hidden from others by default_member_permissions, and the handler checks the roles again
function pollCommand() {
  const b = new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Post a poll in the polls channel (Admins and Moderators)')
    .setDescriptionLocalizations({ ro: 'Postează un sondaj în canalul de sondaje (Admini și Moderatori)' })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('question').setDescription('The question').setDescriptionLocalizations({ ro: 'Întrebarea' }).setRequired(true).setMaxLength(POLL_QUESTION_MAX))
    .addStringOption(answer(1, true))
    .addStringOption(answer(2, true))
    .addIntegerOption((o) =>
      o.setName('hours').setDescription('How long it runs, in hours (1 to 768)').setDescriptionLocalizations({ ro: 'Cât durează, în ore (1 până la 768)' }).setRequired(true).setMinValue(1).setMaxValue(POLL_HOURS_MAX),
    );
  // Discord needs required options first: the optional answers and `multi` come after `hours`
  for (let n = 3; n <= POLL_ANSWERS_MAX; n++) b.addStringOption(answer(n, false));
  b.addBooleanOption((o) => o.setName('multi').setDescription('Allow several answers per person (default: one)').setDescriptionLocalizations({ ro: 'Permite mai multe răspunsuri per persoană (implicit: unul)' }));
  return b.toJSON();
}
