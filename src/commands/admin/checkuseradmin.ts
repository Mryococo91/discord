import FormData from 'form-data';
import { capitalize } from 'lodash';
import { Colours } from '../../@types';
import { Bot, SlashCommand } from '../../classes';
import { sendEmbed } from '../../utils/messages';
import data from '../../config.json';
import axios from 'axios';
import { BaseCommandInteraction, EmbedFieldData, Snowflake } from 'discord.js';

export default class CheckUserAdminCommand extends SlashCommand {
    constructor(client: Bot) {
        super({
            client,
            name: 'checkuseradmin',
            description: 'Check user database status as an admin',
            type: 'CHAT_INPUT',
            options: [
                {
                    type: 'STRING',
                    name: 'id',
                    description: 'User ID',
                    required: false,
                },
                {
                    type: 'USER',
                    name: 'user',
                    description: 'User Mention',
                    required: false,
                },
            ],
            defaultPermission: false,
            staffRole: 'ADMIN',
        });
    }

    public async run(client: Bot, interaction: BaseCommandInteraction): Promise<boolean> {
        const id = (interaction.options.getUser('user')?.id ||
            interaction.options.get('id')?.value) as Snowflake;

        if (id?.length !== 18) {
            sendEmbed({
                interaction,
                embed: {
                    description: '`🔴` You must provide either a user or user id',
                    color: Colours.RED,
                },
            });
            return false;
        }

        const imports = await client.db.imports.findMany({
            where: { id, appealed: false },
            select: {
                BadServer: true,
                server: true,
                roles: true,
                type: true,
            },
        });

        const user = await client.db.users.findUnique({
            where: { id },
        });

        if (!user) {
            sendEmbed({
                interaction,
                embed: {
                    description: '`🟢` User not found in database',
                    color: Colours.GREEN,
                },
            });
            return false;
        }

        if (imports.length === 0) {
            //TODO: Show past history
            sendEmbed({
                interaction,
                embed: {
                    description: '`🟢` User has no outstanding servers to be appealed for',
                    color: Colours.GREEN,
                },
            });
            return false;
        }

        const fields: EmbedFieldData[] = [];
        const value = [];
        let realCount = 0;

        if (imports[0].roles.includes('"servers":')) {
            const parsed = JSON.parse(imports[0].roles);
            const servers = parsed['servers'].split(';');

            const badServers = await client.db.badServers.findMany({
                where: { id: { in: servers } },
                select: { name: true },
            });

            const names = badServers.map(x => x.name);
            const roles = parsed['roles'].split(';');
            const newData = [{ names, roles }];

            const response = await uploadData(newData);
            realCount = servers.length;

            fields.push({
                name: 'Legacy Data',
                value: `> View data: <${response.request.res.responseUrl}>`,
            });
        } else {
            for (let i = 0, l = imports.length; i < l; ++i) {
                const x = imports[i];
                if (x.roles.includes('"servers":')) {
                    const parsed = JSON.parse(x.roles);
                    const servers = parsed['servers'].split(';');

                    const badServers = await client.db.badServers.findMany({
                        where: { id: { in: servers } },
                        select: { name: true },
                    });
                    realCount += servers.length;

                    const names = badServers.map(x => x.name);
                    const roles = parsed['roles'].split(';');
                    const newData = [{ names, roles }];

                    const response = await uploadData(newData);

                    value.push(`Legacy Data\n> View data: <${response.request.res.responseUrl}>\n`);
                } else {
                    realCount += 1;
                    value.push(
                        `${x.BadServer.name}\n> Type: ${x.type} \n> Roles: ${x.roles
                            .split(';')
                            .join(', ')}\n`
                    );
                }
            }
            fields.push({
                name: 'New Servers',
                value: value.join('\n'),
            });
        }
        sendEmbed({
            interaction,
            embed: {
                title: ':shield: User In Database',
                description: `<@${user.id}> has been seen in ${realCount} bad Discord servers.`,
                author: {
                    name: user.last_username,
                    icon_url: user.avatar,
                },
                thumbnail: { url: user.avatar },
                color: Colours.RED,
                fields: [
                    {
                        name: 'User Information',
                        value: `> ID: ${user.id}\n> Status ${capitalize(
                            user.status
                        )}\n> Type: ${capitalize(user.type)}\n> Appeals: ${user.appeals}`,
                        inline: false,
                    },
                    ...fields,
                ],
            },
        });

        return true;
    }
}

async function uploadData(form: any) {
    const formData = new FormData();

    formData.append('lang', 'json');
    formData.append('expire', '1h');
    formData.append('password', '');
    formData.append('title', '');
    formData.append('text', JSON.stringify(form, null, 4));

    const response = await axios.request({
        url: data.POST_URL,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: formData,
    });

    return response;
}
