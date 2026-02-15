import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LoginScreen } from '../screens/LoginScreen'
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen'

export type AuthStackParamList = {
  Login: undefined
  ForgotPassword: undefined
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'ログイン' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'パスワードリセット' }} />
    </Stack.Navigator>
  )
}
