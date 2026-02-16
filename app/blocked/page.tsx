export default function BlockedPage() {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: '#eff6ff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            <div style={{
                maxWidth: '480px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: '64px',
                    marginBottom: '16px',
                }}>🚫</div>
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    marginBottom: '16px',
                    color: '#1e293b',
                }}>
                    Webアプリは利用できません
                </h1>
                <p style={{
                    fontSize: '16px',
                    color: '#64748b',
                    marginBottom: '24px',
                    lineHeight: '1.6',
                }}>
                    このWebアプリは現在ご利用いただけません。<br />
                    モバイルアプリをダウンロードしてご利用ください。
                </p>
                <div style={{
                    padding: '16px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '12px',
                    marginTop: '24px',
                }}>
                    <p style={{
                        fontSize: '14px',
                        color: '#475569',
                        margin: 0,
                    }}>
                        📱 ネイティブアプリのみ利用可能です
                    </p>
                </div>
            </div>
        </div>
    )
}
