// Slash commands registered by setup (guild commands, full replace = idempotent).
import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

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
];
