import React, { useState } from 'react'
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export function ForgotPasswordScreen() {
    const navigation = useNavigation()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const mascot = `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

    const handleSubmit = async () => {
        if (!email) {
            setError('メールアドレスを入力してください。')
            return
        }

        setLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://manabi-ai.vercel.app/reset-password',
            })
            if (error) throw error
            setSuccess(true)
        } catch (error: any) {
            setError(error?.message ?? 'リセットメールの送信に失敗しました。')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <KeyboardAvoidingView
                style={styles.screen}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.container}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.mascotWrap}>
                        <Image source={{ uri: mascot }} style={styles.mascot} />
                    </View>
                    <View style={styles.card}>
                        <View style={styles.successIconWrap}>
                            <Ionicons name="checkmark-circle" size={64} color="#10b981" />
                        </View>
                        <Text style={styles.cardTitle}>メール送信完了</Text>
                        <Text style={styles.cardSubtitle}>
                            パスワードリセット用のメールを送信しました。
                        </Text>
                        <Text style={styles.instructionText}>
                            メールに記載されているリンクをクリックして、新しいパスワードを設定してください。
                        </Text>
                        <Pressable
                            style={styles.primaryButton}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={styles.primaryButtonText}>ログイン画面に戻る</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        )
    }

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={80}
        >
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.mascotWrap}>
                    <Image source={{ uri: mascot }} style={styles.mascot} />
                </View>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>パスワードリセット</Text>
                    <Text style={styles.cardSubtitle}>
                        登録したメールアドレスを入力してください
                    </Text>
                    {error && <Text style={styles.errorText}>{error}</Text>}
                    <Text style={styles.label}>メールアドレス</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="example@email.com"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />
                    <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
                        <Text style={styles.primaryButtonText}>
                            {loading ? '送信中...' : 'リセットメールを送信'}
                        </Text>
                    </Pressable>
                    <Pressable
                        style={styles.linkButton}
                        onPress={() => navigation.goBack()}
                        disabled={loading}
                    >
                        <Text style={styles.linkText}>ログイン画面に戻る</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#eff6ff',
    },
    mascotWrap: {
        alignItems: 'center',
        marginBottom: 16,
    },
    mascot: {
        width: 120,
        height: 120,
        resizeMode: 'contain',
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 12,
    },
    successIconWrap: {
        alignItems: 'center',
        marginBottom: 12,
    },
    instructionText: {
        fontSize: 14,
        color: '#475569',
        textAlign: 'center',
        marginVertical: 12,
        lineHeight: 20,
    },
    label: {
        fontSize: 12,
        color: '#475569',
        marginTop: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 4,
        fontSize: 14,
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 12,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    linkButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    linkText: {
        color: '#2563eb',
        fontSize: 14,
    },
    errorText: {
        backgroundColor: '#fee2e2',
        color: '#b91c1c',
        padding: 8,
        borderRadius: 8,
        fontSize: 12,
        marginTop: 12,
        marginBottom: 4,
    },
})
