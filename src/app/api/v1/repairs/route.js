import RepairModel from './model';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const filter = status ? { status } : {};
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '25');
        const skip = (page - 1) * limit;

        const [repairs, total] = await Promise.all([
            RepairModel.getAllRepairs(filter, skip, limit),
            RepairModel.countRepairs(filter),
        ]);

        return Response.json({ repairs, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('GET /api/v1/repairs error:', error);
        return Response.json({ error: 'Failed to fetch repairs.' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const data = await req.json();
        const { name, email, deviceType, issueDescription, contactMethod, phone } = data;

        if (!name || !email || !deviceType || !issueDescription) {
            return Response.json({ error: 'name, email, deviceType, and issueDescription are required.' }, { status: 400 });
        }

        const repair = await RepairModel.createRepair({ name, email, deviceType, issueDescription, contactMethod, phone });
        return Response.json({ repair }, { status: 201 });
    } catch (error) {
        console.error('POST /api/v1/repairs error:', error);
        return Response.json({ error: 'Failed to submit repair request.' }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const { searchParams } = new URL(req.url);
        const repairID = searchParams.get('repairID');
        if (!repairID) return Response.json({ error: 'repairID is required.' }, { status: 400 });

        const update = await req.json();
        const updated = await RepairModel.updateRepair(repairID, update);
        if (!updated) return Response.json({ error: 'Repair not found.' }, { status: 404 });

        return Response.json({ repair: updated });
    } catch (error) {
        console.error('PUT /api/v1/repairs error:', error);
        return Response.json({ error: 'Failed to update repair.' }, { status: 500 });
    }
}
