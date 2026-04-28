pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'docker compose build'
                    } else {
                        bat 'docker compose build'
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            if [ ! -f .env ]; then
                              if [ -f .env.example ]; then
                                cp .env.example .env
                                echo "Created .env from .env.example (not in Git)."
                              else
                                echo "ERROR: .env missing and no .env.example to copy." >&2
                                exit 1
                              fi
                            fi
                            docker compose up -d
                        '''
                    } else {
                        bat '''
                            if not exist .env (
                              if exist .env.example (
                                copy /Y .env.example .env
                                echo Created .env from .env.example
                              ) else (
                                echo ERROR: .env missing and no .env.example
                                exit /b 1
                              )
                            )
                            docker compose up -d
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'הפייפליין הושלם בהצלחה: Checkout, Build (docker compose build) ו-Deploy (docker compose up -d).'
        }
        failure {
            echo 'הפייפליין נכשל. בדוק את לוגי השלבים (Checkout / Build / Deploy) ואת זמינות Docker וקובץ .env לפי הצורך.'
        }
    }
}
