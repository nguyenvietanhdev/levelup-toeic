// Shared inline error banner for auth forms (extracted verbatim).
export default function AuthError({ message }) {
    if (!message) return null;
    return (
        <div className="auth-error">
            <i className="fas fa-exclamation-circle"></i> {message}
        </div>
    );
}
