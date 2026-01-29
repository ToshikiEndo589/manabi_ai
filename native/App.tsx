import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './src/lib/supabase'
import { FullScreenLoader } from './src/components/FullScreenLoader'
import { AuthStack } from './src/navigation/AuthStack'
import { AppTabs } from './src/navigation/AppTabs'
import { ProfileProvider, useProfile } from './src/contexts/ProfileContext'
import { OnboardingScreen } from './src/screens/OnboardingScreen'

function RootNavigator() {
  const { profile, loading } = useProfile()
  if (loading) {
    return <FullScreenLoader />
  }
  if (!profile) {
    return <OnboardingScreen />
  }
  return <AppTabs />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        setAuthReady(true)
      })
      .catch(() => setAuthReady(true))

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  if (!authReady) {
    return <FullScreenLoader />
  }

  return (
    <NavigationContainer>
      {session ? (
        <ProfileProvider session={session}>
          <RootNavigator />
        </ProfileProvider>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  )
}
