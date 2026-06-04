import BountyModel from "../bounties/model";
import PortfolioModel from "../portfolio/model";
import UserModel from "../users/model";

export default class FeedService {
    static async getFeed(limit = 20, skip = 0) {
        // Fetch more than needed from each source to ensure correct sort order when merging
        // This is a naive approach but works for smaller datasets. 
        // For larger datasets, we'd need a more complex cursor-based pagination or a unified 'Activity' collection.
        
        const fetchLimit = limit + skip; 

        const [bounties, portfolioItems] = await Promise.all([
            BountyModel.getAllBounties({}, 0, fetchLimit),
            PortfolioModel.getAllItems({}, fetchLimit, 0, 'latest')
        ]);

        // Normalize and Tag
        const normalizedBounties = bounties.map(b => ({
            ...b,
            type: 'bounty',
            sortDate: new Date(b.createdAt)
        }));

        const normalizedPortfolio = portfolioItems.map(p => ({
            ...p,
            type: 'showcase',
            sortDate: new Date(p.createdAt)
        }));

        // Merge and Sort
        const allItems = [...normalizedBounties, ...normalizedPortfolio].sort((a, b) => 
            b.sortDate - a.sortDate
        );

        // Paginate
        const paginatedItems = allItems.slice(skip, skip + limit);

        // Enrich with User Data (if not already done by the models)
        // Both models seem to do some enrichment, but let's ensure we have what we need.
        // Actually, the models return raw data mostly, but the Services usually enrich.
        // Let's use the Services instead of Models? 
        // No, Services might have extra business logic. 
        // Let's look at BountyService.getAllBounties - it enriches with usernames.
        // Let's look at PortfolioService.getAllItems - it calls Model directly.
        
        // We should probably enrich here to be safe and consistent.
        const userIDs = [...new Set(paginatedItems.map(i => i.userID || i.creatorID || i.assignedTo))].filter(Boolean);
        const users = await UserModel.getAllUsers(); // This might be heavy if many users. 
        // Better to fetch just the needed users, but UserModel doesn't have a bulk get by IDs method exposed easily?
        // UserModel.getAllUsers fetches ALL. 
        // Let's just use the getAllUsers for now as it's likely cached or fast enough for this scale.
        
        const userMap = {};
        users.forEach(u => {
            userMap[u.userID] = {
                firstName: u.firstName,
                lastName: u.lastName,
                username: u.username,
                image: u.image,
                discordId: u.discordId
            };
        });

        return paginatedItems.map(item => {
            const creatorID = item.userID || item.creatorID; // Portfolio uses userID, Bounty uses creatorID
            const creator = userMap[creatorID] || {};
            
            return {
                ...item,
                creator: {
                    userID: creatorID,
                    firstName: creator.firstName || 'Unknown',
                    lastName: creator.lastName || '',
                    username: creator.username || 'Unknown',
                    image: creator.image
                }
            };
        });
    }
}
