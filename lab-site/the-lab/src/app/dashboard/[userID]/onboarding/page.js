"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import LoadingTerminal from "@/app/components/LoadingTerminal";

const COMMON_INTERESTS = [
    "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
    "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
    "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
    "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography",
    "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games",
];
const CREATOR_TYPES = ['Maker', 'Crafter', 'Artist', 'Hacker', 'Other'];

const OnboardingPage = () => {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const [loading, setLoading] = useState(true);
    const [fetchedUser, setFetchedUser] = useState(null);
    const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", discordHandle: "", bio: "", creatorType: [], interests: [], cityChange: "", knownMembers: "", questions: "" });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [interestInput, setInterestInput] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (status === "unauthenticated") { router.push("/auth/signin"); return; }
        if (status !== "authenticated" || !session?.user?.userID) return;
        fetch(`/api/v1/users?userID=${session.user.userID}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const u = data.user;
                setFetchedUser(u);
                setForm(prev => ({
                    ...prev,
                    firstName: u.firstName || "",
                    lastName: u.lastName || "",
                    phoneNumber: u.phoneNumber || "",
                    discordHandle: u.discordHandle || (u.provider === 'discord' ? u.username : ""),
                    bio: u.bio || "",
                    creatorType: Array.isArray(u.creatorType) ? u.creatorType : (u.creatorType ? [u.creatorType] : []),
                    interests: Array.isArray(u.interests) ? u.interests : [],
                    cityChange: u.cityChange || "",
                    knownMembers: u.knownMembers || "",
                    questions: u.questions || "",
                }));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [session, status, router]);

    const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const toggleCreatorType = (type) => {
        setForm(prev => ({
            ...prev,
            creatorType: prev.creatorType.includes(type)
                ? prev.creatorType.filter(t => t !== type)
                : [...prev.creatorType, type],
        }));
    };

    const addInterest = (val) => {
        const v = val.trim();
        if (v && !form.interests.includes(v)) setForm(f => ({ ...f, interests: [...f.interests, v] }));
        setInterestInput("");
        setShowSuggestions(false);
    };

    const removeInterest = (val) => setForm(f => ({ ...f, interests: f.interests.filter(i => i !== val) }));

    const filteredSuggestions = COMMON_INTERESTS.filter(i => i.toLowerCase().includes(interestInput.toLowerCase()) && !form.interests.includes(i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        try {
            const updatedMembership = { ...fetchedUser?.membership, applicationDate: fetchedUser?.membership?.applicationDate || new Date().toISOString() };
            const res = await fetch(`/api/v1/users?userID=${params.userID}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, membership: updatedMembership }),
            });
            if (res.ok) {
                setSuccess(true);
                setTimeout(() => router.push(`/dashboard/${params.userID}`), 2000);
            } else {
                const data = await res.json();
                setError(data.message || "Update failed.");
            }
        } catch { setError("Something went wrong."); }
    };

    if (loading || status === "loading") return <LoadingTerminal />;

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };
    const fieldWrap = { marginBottom: 20 };

    return (
        <div style={{ padding: '20px 24px', maxWidth: 680, margin: '0 auto' }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./onboarding --questionnaire</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>onboarding questionnaire</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6 }}>complete your profile to continue the membership process.</p>
            </div>

            {error && <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 20, fontSize: 12, fontFamily: 'var(--mono)' }}>✕ {error}</div>}
            {success && <div style={{ border: '1px solid var(--green)', color: 'var(--green)', padding: '10px 14px', marginBottom: 20, fontSize: 12, fontFamily: 'var(--mono)' }}>✓ Information saved! Redirecting...</div>}

            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px' }}>
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        {!fetchedUser?.firstName && (
                            <div>
                                <label style={labelStyle}>FIRST_NAME *</label>
                                <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} name="firstName" value={form.firstName} onChange={handleChange} required />
                            </div>
                        )}
                        {!fetchedUser?.lastName && (
                            <div>
                                <label style={labelStyle}>LAST_NAME *</label>
                                <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} name="lastName" value={form.lastName} onChange={handleChange} required />
                            </div>
                        )}
                        {!fetchedUser?.phoneNumber && (
                            <div>
                                <label style={labelStyle}>PHONE_NUMBER *</label>
                                <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} name="phoneNumber" value={form.phoneNumber} onChange={handleChange} required />
                            </div>
                        )}
                        {!fetchedUser?.discordHandle && (
                            <div>
                                <label style={labelStyle}>DISCORD_HANDLE *</label>
                                <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} name="discordHandle" value={form.discordHandle} onChange={handleChange} required />
                                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>Required for community access</div>
                            </div>
                        )}
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>ABOUT_YOU (BIO) *</label>
                        <textarea className="input" rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} name="bio" value={form.bio} onChange={handleChange} required />
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>CREATOR_TYPE — what kind of creator are you?</label>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {CREATOR_TYPES.map(type => (
                                <button key={type} type="button" onClick={() => toggleCreatorType(type)}
                                    className={`btn btn--sm ${form.creatorType.includes(type) ? '' : 'btn--ghost'}`}
                                    style={{ fontSize: 10, borderColor: form.creatorType.includes(type) ? 'var(--green)' : undefined, color: form.creatorType.includes(type) ? 'var(--green)' : undefined }}>
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>INTERESTS &amp; SKILLS</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {form.interests.map(i => (
                                <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {i} <button type="button" onClick={() => removeInterest(i)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                                </span>
                            ))}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} placeholder="Add interests... (press Enter)" value={interestInput}
                                onChange={e => { setInterestInput(e.target.value); setShowSuggestions(true); }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (interestInput.trim()) addInterest(interestInput); } }}
                                onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
                            {showSuggestions && interestInput && filteredSuggestions.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                                    {filteredSuggestions.slice(0, 10).map(s => (
                                        <button key={s} type="button" onMouseDown={() => addInterest(s)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', borderBottom: '1px solid var(--bd)' }}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>CITY_CHANGE — if you could change one thing in our city, what would it be? *</label>
                        <textarea className="input" rows={2} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} name="cityChange" value={form.cityChange} onChange={handleChange} required />
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>KNOWN_MEMBERS — do you know any current co-op members?</label>
                        <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} name="knownMembers" value={form.knownMembers} onChange={handleChange} />
                    </div>

                    <div style={fieldWrap}>
                        <label style={labelStyle}>QUESTIONS — do you have any questions for us?</label>
                        <textarea className="input" rows={2} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} name="questions" value={form.questions} onChange={handleChange} />
                    </div>

                    <button type="submit" className="btn btn--filled" style={{ width: '100%', fontSize: 12, marginTop: 8 }}>$ submit questionnaire</button>
                </form>
            </div>
        </div>
    );
};

export default OnboardingPage;
