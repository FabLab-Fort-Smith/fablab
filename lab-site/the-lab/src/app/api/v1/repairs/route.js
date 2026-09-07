import { auth } from '@/auth';
import RepairModel, { isValidRepairID, isValidStatus, sanitizeRepairUpdate } from './model';
import { CORE_EVENTS } from '@/lib/plugins/hooks';
import { emitEvent } from '@/lib/plugins/registry';

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

        // Notify enabled plugins (best-effort, ID-only; no PII in the payload; a
        // slow/throwing handler never breaks the intake).
        await emitEvent(CORE_EVENTS.REPAIR_CREATED, { repairID: repair.repairID }).catch(() => {});

        return Response.json({ repair }, { status: 201 });
    } catch (error) {
        console.error('POST /api/v1/repairs error:', error);
        return Response.json({ error: 'Failed to submit repair request.' }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        // AuthN + authZ: updating a repair is a staff action. Derive the actor from
        // the server session (never a client-supplied field) and require the single
        // privileged role (`admin`) — deny by default, fail closed, generic errors.
        // (/api/* is not covered by middleware, so the route must protect itself.)
        const session = await auth();
        if (!session?.user) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
        if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden.' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const repairID = searchParams.get('repairID');
        if (!repairID) return Response.json({ error: 'repairID is required.' }, { status: 400 });
        // Validate the id shape before it is ever used as a Mongo filter (BOLA/NoSQL).
        if (!isValidRepairID(repairID)) return Response.json({ error: 'Invalid repairID.' }, { status: 400 });

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return Response.json({ error: 'A JSON object body is required.' }, { status: 400 });
        }

        // Bind the update to the explicit allow-list (CWE-915 mass-assignment): only
        // staff-workflow fields are $set; identity/ownership/PII/timestamps are dropped.
        const update = sanitizeRepairUpdate(body);
        if (Object.keys(update).length === 0) {
            return Response.json({ error: 'No updatable fields provided.' }, { status: 400 });
        }
        if ('status' in update && !isValidStatus(update.status)) {
            return Response.json({ error: 'Invalid status.' }, { status: 400 });
        }

        const updated = await RepairModel.updateRepair(repairID, update);
        if (!updated) return Response.json({ error: 'Repair not found.' }, { status: 404 });

        // Notify enabled plugins (best-effort, ID-only; status is a non-PII enum).
        await emitEvent(CORE_EVENTS.REPAIR_UPDATED, {
            repairID: updated.repairID,
            status: updated.status,
        }).catch(() => {});

        return Response.json({ repair: updated });
    } catch (error) {
        console.error('PUT /api/v1/repairs error:', error);
        return Response.json({ error: 'Failed to update repair.' }, { status: 500 });
    }
}
