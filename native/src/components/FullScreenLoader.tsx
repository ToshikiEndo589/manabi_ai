import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

export function FullScreenLoader() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
})
