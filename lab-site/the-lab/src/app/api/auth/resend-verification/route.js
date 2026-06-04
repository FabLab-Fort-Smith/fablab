import AuthController from "../[...nextauth]/controller";

export async function POST(request) {
    try {
        const { email } = await request.json();
        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required.' }), { status: 400 });
        }

        await AuthController.resendVerification(email);
        return new Response(JSON.stringify({ message: 'Verification email sent successfully.' }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
