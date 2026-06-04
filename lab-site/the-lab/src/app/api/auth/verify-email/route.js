import AuthController from "../[...nextauth]/controller";

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return new Response(JSON.stringify({ error: 'Token is missing.' }), { status: 400 });
    }

    try {
        await AuthController.verifyEmail(token);
        return new Response(JSON.stringify({ message: 'Email verified successfully.' }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
}
