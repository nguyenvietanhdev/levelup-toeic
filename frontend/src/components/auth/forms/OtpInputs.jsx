// Shared 6-digit OTP input row. Behaviour preserved verbatim from the
// inline AuthModal version (including the existing forward-focus quirk
// handled by the parent's handleOtpChange).
export default function OtpInputs({ prefix, otpDigits, onChange }) {
    return (
        <div className="otp-inputs">
            {otpDigits.map((d, i) => (
                <input
                    key={i}
                    id={`${prefix}-${i}`}
                    type="text"
                    maxLength={1}
                    className="otp-digit"
                    value={d}
                    onChange={(e) => onChange(i, e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Backspace" && !d && i > 0)
                            document.getElementById(`${prefix}-${i - 1}`)?.focus();
                    }}
                />
            ))}
        </div>
    );
}
