import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDRDVU-FQANzQIpHw6buxDi-DI6bJ8AcUE",
  authDomain: "kabataku-project.firebaseapp.com",
  databaseURL: "https://kabataku-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kabataku-project",
  storageBucket: "kabataku-project.firebasestorage.app",
  messagingSenderId: "286516922186",
  appId: "1:286516922186:web:ea81fa4e3c3cffc93323b3",
  measurementId: "G-EZKF6XJHPW"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function loadLeaderboard() {
    const leaderboardRef = query(
        ref(db, 'leaderboard'), 
        orderByChild('score'), 
        limitToLast(10) 
    );
    
    onValue(leaderboardRef, (snapshot) => {
        const data = snapshot.val();
        let scores = [];
        
        for (let id in data) { 
            scores.push(data[id]); 
        }
        
        
        scores.sort((a, b) => b.score - a.score);
        
        const tbody = document.getElementById('leaderboardBody');
        tbody.innerHTML = ''; 
        
        scores.forEach((entry, index) => {
          
            tbody.innerHTML += `
                <tr class="rank-${index + 1}">
                    <td>${index + 1}</td>
                    <td>${entry.name}</td>
                    <td>${entry.score}</td>
                </tr>`;
        });
    });
}

loadLeaderboard();


