import { Client, GatewayIntentBits, ChannelType, VoiceChannel } from 'discord.js';
import 'dotenv/config';  

console.log("TOKEN:", process.env.TOKEN);
console.log("REQUIRED_ROLE_ID:", process.env.REQUIRED_ROLE_ID);
console.log("SPECIFIC_CHANNEL_ID:", process.env.SPECIFIC_CHANNEL_ID);


const TOKEN: string = process.env.TOKEN!;
const requiredRoleId: string = process.env.REQUIRED_ROLE_ID!;
const specificChannelId: string = process.env.SPECIFIC_CHANNEL_ID!;

console.log(TOKEN, requiredRoleId, specificChannelId);
const checkInterval = 60000; // 60 seconds

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const createdChannels = new Set<string>(); // To keep track of created channel IDs

client.once('ready', () => {
    console.log('Bot is online!');

    // Start a periodic check for empty channels
    setInterval(checkEmptyChannels, checkInterval);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const { channelId: oldChannelId, member: oldMember } = oldState;
    const { channelId: newChannelId, member: newMember } = newState;

    console.log("Voice state updated:", { oldChannelId, newChannelId, newMember: newMember?.user.username });

    if (newChannelId === specificChannelId && newMember !== null) {
        const guild = newMember.guild;
        const user = newMember.user;
        const voiceChannel = guild.channels.cache.get(newChannelId);

        if (voiceChannel) {
            try {
                console.log(`Creating a new channel for ${user.username}`);
                const newChannel = await guild.channels.create({
                    name: `${user.username}'s team`,
                    type: ChannelType.GuildVoice,
                    parent: voiceChannel.parentId, // Optional: Set the same category as the original channel
                });

                // Add the created channel to the tracking set
                createdChannels.add(newChannel.id);

                await newMember.voice.setChannel(newChannel);
                console.log(`Created and moved ${user.username} to ${newChannel.name}`);
            } catch (error) {
                console.error('Error creating or moving channel:', error);
            }
        }
    }

    if (oldChannelId !== null && newChannelId === null && oldMember !== null) {
        const oldChannel = oldState.guild.channels.cache.get(oldChannelId) as VoiceChannel;

        if (oldChannel && createdChannels.has(oldChannelId) && oldChannel.members.size === 0) {
            try {
                console.log(`Deleting channel for ${oldMember.user.username}`);
                await oldChannel.delete();
                createdChannels.delete(oldChannelId); // Remove it from the tracking set
                console.log(`Deleted channel ${oldChannel.name}`);
            } catch (error) {
                console.error('Error deleting channel:', error);
            }
        }
    }
});

// Periodically check and delete empty channels
async function checkEmptyChannels() {
    console.log('Checking for empty channels...');
    
    for (const channelId of createdChannels) {
        const channel = await client.channels.fetch(channelId) as VoiceChannel;
        if (channel && channel.members.size === 0) {
            try {
                console.log(`Deleting empty channel: ${channel.name}`);
                await channel.delete();
                createdChannels.delete(channelId); // Remove it from the tracking set
            } catch (error) {
                console.error('Error deleting empty channel:', error);
            }
        }
    }
}

client.on('messageCreate', async (message) => {
    const prefix = '!';
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command === 'custom') {
        if (!message.member?.roles.cache.has(requiredRoleId)) {
            message.channel.send('You do not have the required role to use this command.');
            return;
        }

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) {
            message.channel.send('You need to be in a voice channel to randomize players.');
            return;
        }

        const members = voiceChannel.members;

        if (members.size !== 10) {
            message.channel.send('There must be exactly 10 players in the voice channel.');
            return;
        }

        const shuffledMembers = shuffle(Array.from(members.values()));
        const team1 = shuffledMembers.slice(0, 5);
        const team2 = shuffledMembers.slice(5, 10);

        try {
            const team1Channel = await message.guild.channels.create({
                name: 'Team 1',
                type: ChannelType.GuildVoice,
                parent: voiceChannel.parentId,
            });

            const team2Channel = await message.guild.channels.create({
                name: 'Team 2',
                type: ChannelType.GuildVoice,
                parent: voiceChannel.parentId,
            });

            createdChannels.add(team1Channel.id);
            createdChannels.add(team2Channel.id);

            for (const member of team1) {
                await member.voice.setChannel(team1Channel);
            }
            for (const member of team2) {
                await member.voice.setChannel(team2Channel);
            }

            message.channel.send('Players have been randomized into two teams!');
        } catch (error) {
            console.error('Error creating channels or moving members:', error);
            message.channel.send('An error occurred while creating teams.');
        }
    }
});

// Utility function to shuffle an array
function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

client.login(TOKEN);
