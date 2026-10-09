// Slash commands registered by setup (guild commands, full replace = idempotent).
import { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type SlashCommandStringOption, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
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
  new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set your language roles: English, Romanian or both (Members)')
    .setDescriptionLocalizations({ ro: 'Setează-ți limbile: engleză, română sau ambele (Membri)' })
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('language').setDescription('Your language').setDescriptionLocalizations({ ro: 'Limba ta' }).setRequired(true)
        .addChoices({ name: 'English', value: 'EN', name_localizations: { ro: 'Engleză' } }, { name: 'Română', value: 'RO', name_localizations: { ro: 'Română' } }, { name: 'English + Română', value: 'both', name_localizations: { ro: 'Engleză + Română' } }),
    )
    .toJSON(),
  dailyCommand('daily'),
  dailyCommand('wordle'),
  pollCommand(),
];

// /daily and /wordle: same behaviour, two names (Members only, checked by the handler)
function dailyCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Play today's FC Solver Daily: guess the EA FC player (Members)")
    .setDescriptionLocalizations({ ro: 'Joacă FC Solver Daily de azi: ghicește jucătorul EA FC (Membri)' })
    .setContexts(InteractionContextType.Guild)
    .toJSON();
}

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

/** Message context menu (Apps → End poll): Admin only (hidden by ManageGuild, the handler checks the role again). */
export const END_POLL = 'End poll';
export const MENU_COMMANDS = [
  new ContextMenuCommandBuilder().setName(END_POLL).setNameLocalizations({ ro: 'Închide sondajul' }).setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(InteractionContextType.Guild).toJSON(),
];
