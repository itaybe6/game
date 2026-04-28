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
                    // App stack only — avoid building jenkins/ngrok (CI runs inside Jenkins; 8081 already in use)
                    if (isUnix()) {
                        sh 'docker compose build db app frontend'
                    } else {
                        bat 'docker compose build db app frontend'
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
                            # Replace only app containers (avoid name conflicts / half-stopped recreate); do not touch jenkins
                            docker compose stop db app frontend 2>/dev/null || true
                            docker compose rm -f db app frontend 2>/dev/null || true
                            docker compose up -d --remove-orphans db app frontend
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
                            docker compose stop db app frontend 2>nul & docker compose rm -f db app frontend 2>nul & docker compose up -d --remove-orphans db app frontend
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'הפייפליין הושלם בהצלחה: Checkout, Build ו-Deploy (db, app, frontend בלבד — ללא jenkins/ngrok).'
        }
        failure {
            echo 'הפייפליין נכשל. בדוק את לוגי השלבים (Checkout / Build / Deploy) ואת זמינות Docker וקובץ .env לפי הצורך.'
        }
    }
}
