// lib/constants.js
const Constants = {
    USERS_COLLECTION: 'users',
    PLANS_COLLECTION: 'plans',
    DEFAULT_PROJECTION: {
        _id: 0,
    },
    // Map Creator Types to Discord Role IDs
    CREATOR_ROLE_MAPPING: {
        'Hacker': '1418030549066580090',
        'Maker': '1453265292204576882',
        'Crafter': '1453265133366411275',
        'Artist': '1453264892059582536',
    },
    LAB_RATZ_ROLE_ID: '1348382987611275386',
    CHECKED_IN_ROLE_ID: '1454374170388598909',
    TOP_RUNNER_ROLE_ID: '1454374170388598909', // TODO: Update with actual role ID
    REQUIRED_VOLUNTEER_HOURS: 4,
    ONBOARDING_REWARDS: {
        REGISTER: 10,
        VERIFY_EMAIL: 10,
        COMPLETE_PROFILE: 10,
        SUBMIT_APPLICATION: 10,
        SUBSCRIBE: 25
    },
    BADGES: {
        FOUNDER: { id: 'founder', name: 'Founder', icon: '🚀', description: 'Early supporter of the lab.', type: 'admin' },
        BOUNTY_HUNTER: { id: 'bounty_hunter', name: 'Bounty Hunter', icon: '🎯', description: 'Completed 5+ Bounties.', type: 'system' },
        VOLUNTEER_STAR: { id: 'volunteer_star', name: 'Volunteer Star', icon: '⭐', description: 'Logged 10+ Volunteer Hours.', type: 'system' },
        BUG_SQUASHER: { id: 'bug_squasher', name: 'Bug Squasher', icon: '🐛', description: 'Helped fix a bug in the system.', stakeReward: 100, type: 'admin' },
        RECOVERY_SPECIALIST: { id: 'recovery_specialist', name: 'Recovery Specialist', icon: '🚑', description: 'Restored critical system functionality.', stakeReward: 100, type: 'admin' },
        MAKER: { id: 'maker', name: 'Certified Maker', icon: '🛠️', description: 'Completed safety orientation.', type: 'admin' },
        TRAINED_3D_PRINTER: { id: 'trained_3d_printer', name: '3D Printer Certified', icon: '🖨️', description: 'Trained on 3D Printers.', type: 'admin' },
        TRAINED_CO2_LASER: { id: 'trained_co2_laser', name: 'CO2 Laser Certified', icon: '🔦', description: 'Trained on CO2 Laser.', type: 'admin' },
        TRAINED_FIBER_LASER: { id: 'trained_fiber_laser', name: 'Fiber Laser Certified', icon: '⚡', description: 'Trained on Fiber Laser.', type: 'admin' },
        SHOWCASE_PIONEER: { id: 'showcase_pioneer', name: 'Showcase Pioneer', icon: '📸', description: 'Posted first project to Showcase.', stakeReward: 10, type: 'system' },
        COMMUNITY_VOICE: { id: 'community_voice', name: 'Community Voice', icon: '🗣️', description: 'Left 3+ comments on projects.', stakeReward: 5, type: 'system' },
        LAB_REGULAR: { id: 'lab_regular', name: 'Lab Regular', icon: '📍', description: 'Checked in 5+ times.', stakeReward: 5, type: 'system' },
        SCRIPT_KIDDIE: { id: 'script_kiddie', name: 'Script Kiddie', icon: '💻', description: 'Found the first flag in the terminal.', stakeReward: 10, type: 'system' },
        WHITE_HAT: { id: 'white_hat', name: 'White Hat', icon: '🎩', description: 'Found the hidden system flag.', stakeReward: 50, type: 'system' },
        ELITE_HACKER: { id: 'elite_hacker', name: 'Elite Hacker', icon: '👾', description: 'Hacked the planet.', stakeReward: 100, type: 'system' },
        SYSTEM_ADMIN: { id: 'system_admin', name: 'System Admin', icon: '🛡️', description: 'Saved the mainframe from total collapse.', stakeReward: 250, type: 'system' },
        HISTORIAN: { id: 'historian', name: 'Historian', icon: '📜', description: 'Uncovered the history of the Lab.', stakeReward: 25, type: 'system' },
        PHREAKER: { id: 'phreaker', name: 'Phreaker', icon: '📞', description: 'Connected with the underground.', stakeReward: 25, type: 'system' },
        INSIDER: { id: 'insider', name: 'Insider', icon: '🕵️', description: 'Found sensitive board documents.', stakeReward: 50, type: 'system' },
        NETWORK_ENGINEER: { id: 'network_engineer', name: 'Network Engineer', icon: '📡', description: 'Mapped the internal network.', stakeReward: 50, type: 'system' },
        REMOTE_OPERATOR: { id: 'remote_operator', name: 'Remote Operator', icon: '📟', description: 'Accessed a remote server.', stakeReward: 75, type: 'system' },
        DBA: { id: 'dba', name: 'Database Admin', icon: '🗄️', description: 'Extracted data from the SQL database.', stakeReward: 75, type: 'system' },
        ROOTKIT_MASTER: { id: 'rootkit_master', name: 'Rootkit Master', icon: '💀', description: 'Gained root access on a secure node.', stakeReward: 150, type: 'system' },
        VIRUS_HUNTER: { id: 'virus_hunter', name: 'Virus Hunter', icon: '🦠', description: 'Neutralized the system virus.', stakeReward: 200, type: 'system' },
        HARDWARE_HACKER: { id: 'hardware_hacker', name: 'Hardware Hacker', icon: '🔌', description: 'Interfaced with the physical control layer.', stakeReward: 200, type: 'system' },
        AI_WHISPERER: { id: 'ai_whisperer', name: 'AI Whisperer', icon: '🧠', description: 'Communicated with the Core AI.', stakeReward: 500, type: 'system' },
        FORENSIC_ACCOUNTANT: { id: 'forensic_accountant', name: 'Forensic Accountant', icon: '📊', description: 'Traced the money trail.', stakeReward: 75, type: 'system' },
        WEB_EXPLOITER: { id: 'web_exploiter', name: 'Web Exploiter', icon: '🌐', description: 'Found and exploited a web backdoor.', stakeReward: 75, type: 'system' },
        BOMB_SQUAD: { id: 'bomb_squad', name: 'Bomb Squad', icon: '💣', description: 'Defused a logic bomb.', stakeReward: 100, type: 'system' },
        REVERSE_ENGINEER: { id: 'reverse_engineer', name: 'Reverse Engineer', icon: '🧬', description: 'Analyzed a malicious binary.', stakeReward: 150, type: 'system' },
        GHOST_BUSTER: { id: 'ghost_buster', name: 'Ghost Buster', icon: '👻', description: 'Removed a persistent threat.', stakeReward: 300, type: 'system' },
        EASTER_EGG_HUNTER: { id: 'easter_egg_hunter', name: 'Easter Egg Hunter', icon: '🥚', description: 'Found a hidden secret.', stakeReward: 500, type: 'system' }
    },
    DISCORD_SHOWCASE_CHANNEL_ID: '1454353592755687575',
    DISCORD_HACK_THE_LAB_CHANNEL_ID: '1454697627315863735', // TODO: Update with actual channel ID
    DISCORD_ANNOUNCEMENTS_CHANNEL_ID: '945554100739801098',
    MISSIONS: {
        1: {
            name: "Initial Access",
            flags: [
                "flag{welcome_to_the_lab}",
                "flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}",
                "flag{hack_the_planet}"
            ]
        },
        2: {
            name: "Operation Blackout",
            flags: ["flag{protocol_override_initiated}"]
        },
        3: {
            name: "System Restoration",
            flags: ["flag{system_restoration_imminent}"]
        },
        4: {
            name: "Network Discovery",
            flags: ["flag{internal_network_mapped}"]
        },
        5: {
            name: "Information Gathering",
            flags: [
                "flag{ache_building_legacy}",
                "flag{shell_on_the_border_forever}",
                "flag{admin_access_granted}"
            ]
        },
        6: {
            name: "Privilege Escalation",
            flags: ["flag{follow_the_money_trail}"]
        },
        7: {
            name: "Web Security",
            flags: ["flag{api_backdoor_discovered}"]
        },
        8: {
            name: "Process Forensics",
            flags: ["flag{logic_bomb_defused}"]
        },
        9: {
            name: "Binary Analysis",
            flags: ["flag{c2_server_identified}"]
        },
        10: {
            name: "System Hardening",
            flags: ["flag{system_hardened_ghost_busted}"]
        }
    }
};

export default Constants;
