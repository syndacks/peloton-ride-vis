document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const durationFilter = document.getElementById('durationFilter');
    const timeRange = document.getElementById('timeRange');
    const trendlineToggle = document.getElementById('trendlineToggle');
    const outlierToggle = document.getElementById('outlierToggle');
    let outputChart = null;
    let workouts = [];
  
    function handleDragOver(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    }
  
    function handleDragLeave(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    }
  
    function handleDrop(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            parseCSV(file);
        }
    }
  
    function parseCSV(file) {
        Papa.parse(file, {
            complete: function(results) {
                workouts = parseWorkouts(results.data);
                updateDurationOptions();
                updateTimeRangeOptions();
                updateVisualization();
            }
        });
    }
  
    function parseWorkouts(data) {
        console.log("Starting to parse CSV data:", data);
        
        const workouts = [];
        const headers = data[0];
        
        const dateIndex = headers.findIndex(col => col.includes('Workout Timestamp'));
        const typeIndex = headers.findIndex(col => col.includes('Fitness Discipline'));
        const durationIndex = headers.findIndex(col => col.includes('Length'));
        const outputIndex = headers.findIndex(col => col.includes('Total Output'));
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            
            if (row.length <= 1) continue;
            
            const workout = {
                date: row[dateIndex]?.split(' ')[0],
                timestamp: new Date(row[dateIndex]).getTime(),
                type: row[typeIndex],
                duration: parseInt(row[durationIndex]),
                output: parseFloat(row[outputIndex])
            };
    
            if (workout.type === 'Cycling' && !isNaN(workout.output) && workout.output > 0) {
                workouts.push(workout);
            }
        }
    
        return workouts.sort((a, b) => a.timestamp - b.timestamp);
    }
  
    function updateDurationOptions() {
        const durations = [...new Set(workouts.map(w => w.duration))].sort((a, b) => a - b);
        durationFilter.innerHTML = '<option value="all">All Durations</option>' +
            durations.map(d => `<option value="${d}">${d} min</option>`).join('');
    }

    function updateTimeRangeOptions() {
        // Get unique years from workout data
        const years = [...new Set(workouts.map(w => new Date(w.timestamp).getFullYear()))]
            .sort((a, b) => b - a);  // Sort years in descending order
        
        // Create the base options
        const baseOptions = `
            <option value="all">All Time</option>
            <option value="year">Last Year</option>
            <option value="6months">Last 6 Months</option>
            <option value="3months">Last 3 Months</option>
            <option value="month">Last Month</option>
            <optgroup label="Calendar Years">
        `;

        // Add calendar year options
        const yearOptions = years.map(year => 
            `<option value="calendar${year}">Calendar ${year}</option>`
        ).join('');

        timeRange.innerHTML = baseOptions + yearOptions + '</optgroup>';
    }

    function calculatePolynomialRegression(xValues, yValues, degree) {
        const n = xValues.length;
        if (n < degree + 1) return null;

        // Create matrices for the system of equations
        const matrix = [];
        const vector = [];
        
        // Fill the matrix and vector
        for (let i = 0; i <= degree; i++) {
            const row = [];
            let sum = 0;
            
            for (let j = 0; j <= degree; j++) {
                let value = 0;
                for (let k = 0; k < n; k++) {
                    value += Math.pow(xValues[k], i + j);
                }
                row.push(value);
            }
            
            for (let k = 0; k < n; k++) {
                sum += yValues[k] * Math.pow(xValues[k], i);
            }
            
            matrix.push(row);
            vector.push(sum);
        }

        // Solve the system using Gaussian elimination
        for (let i = 0; i < degree + 1; i++) {
            let maxEl = Math.abs(matrix[i][i]);
            let maxRow = i;
            
            for (let k = i + 1; k < degree + 1; k++) {
                if (Math.abs(matrix[k][i]) > maxEl) {
                    maxEl = Math.abs(matrix[k][i]);
                    maxRow = k;
                }
            }

            for (let k = i; k < degree + 1; k++) {
                const tmp = matrix[maxRow][k];
                matrix[maxRow][k] = matrix[i][k];
                matrix[i][k] = tmp;
            }
            
            const tmp = vector[maxRow];
            vector[maxRow] = vector[i];
            vector[i] = tmp;

            for (let k = i + 1; k < degree + 1; k++) {
                const c = -matrix[k][i] / matrix[i][i];
                for (let j = i; j < degree + 1; j++) {
                    if (i === j) {
                        matrix[k][j] = 0;
                    } else {
                        matrix[k][j] += c * matrix[i][j];
                    }
                }
                vector[k] += c * vector[i];
            }
        }

        // Back substitution
        const coefficients = new Array(degree + 1).fill(0);
        for (let i = degree; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < degree + 1; j++) {
                sum += matrix[i][j] * coefficients[j];
            }
            coefficients[i] = (vector[i] - sum) / matrix[i][i];
        }

        return coefficients;
    }

    function calculateTrendLine(data) {
        const n = data.length;
        if (n < 4) return null; // Need at least 4 points for a meaningful trend

        // Convert timestamps to x values (days since first workout)
        const firstTimestamp = data[0].timestamp;
        const xValues = data.map(w => (w.timestamp - firstTimestamp) / (24 * 60 * 60 * 1000));
        const yValues = data.map(w => w.output);

        // Normalize x values to prevent numerical instability
        const xMax = Math.max(...xValues);
        const normalizedX = xValues.map(x => x / xMax);

        // Calculate polynomial regression (degree 3 for a good balance)
        const coefficients = calculatePolynomialRegression(normalizedX, yValues, 3);
        if (!coefficients) return null;

        // Generate points for the trend line
        // Use more points than data points for a smoother curve
        const numPoints = Math.min(100, n * 2);
        const trendPoints = [];
        
        for (let i = 0; i < numPoints; i++) {
            const x = (i / (numPoints - 1)) * Math.max(...normalizedX);
            let y = 0;
            for (let j = 0; j < coefficients.length; j++) {
                y += coefficients[j] * Math.pow(x, j);
            }
            
            // Convert normalized x back to date
            const timestamp = firstTimestamp + (x * xMax * 24 * 60 * 60 * 1000);
            const date = new Date(timestamp).toISOString().split('T')[0];
            
            trendPoints.push({
                x: date,
                y: y
            });
        }

        return trendPoints;
    }

    function filterOutliers(workouts) {
        if (workouts.length < 4) return workouts; // Need enough data points
        
        // Group workouts by duration to compare similar length rides
        const workoutsByDuration = {};
        workouts.forEach(workout => {
            if (!workoutsByDuration[workout.duration]) {
                workoutsByDuration[workout.duration] = [];
            }
            workoutsByDuration[workout.duration].push(workout);
        });

        // Process each duration group separately
        const filteredWorkouts = [];
        Object.values(workoutsByDuration).forEach(durationGroup => {
            if (durationGroup.length < 4) {
                // If not enough data points in group, keep all workouts
                filteredWorkouts.push(...durationGroup);
                return;
            }

            // Calculate statistics for this duration group
            const outputs = durationGroup.map(w => w.output);
            const mean = outputs.reduce((a, b) => a + b) / outputs.length;
            
            // Calculate standard deviation
            const squareDiffs = outputs.map(output => {
                const diff = output - mean;
                return diff * diff;
            });
            const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
            const stdDev = Math.sqrt(avgSquareDiff);

            // Define outlier threshold (3 standard deviations from mean)
            const lowerThreshold = mean - (3 * stdDev);
            const upperThreshold = mean + (3 * stdDev);

            // Filter outliers
            const validWorkouts = durationGroup.filter(workout => 
                workout.output >= lowerThreshold && 
                workout.output <= upperThreshold
            );
            
            filteredWorkouts.push(...validWorkouts);
        });

        return filteredWorkouts;
    }
  
    function filterWorkouts() {
        let filtered = [...workouts];
        
        // Apply duration filter
        if (durationFilter.value !== 'all') {
            const duration = parseInt(durationFilter.value);
            filtered = filtered.filter(w => w.duration === duration);
        }

        // Apply time range filter
        const now = Date.now();
        if (timeRange.value.startsWith('calendar')) {
            const year = parseInt(timeRange.value.substring(8));
            filtered = filtered.filter(w => {
                const workoutYear = new Date(w.timestamp).getFullYear();
                return workoutYear === year;
            });
        } else {
            switch (timeRange.value) {
                case 'year':
                    filtered = filtered.filter(w => w.timestamp > now - 365 * 24 * 60 * 60 * 1000);
                    break;
                case '6months':
                    filtered = filtered.filter(w => w.timestamp > now - 180 * 24 * 60 * 60 * 1000);
                    break;
                case '3months':
                    filtered = filtered.filter(w => w.timestamp > now - 90 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    filtered = filtered.filter(w => w.timestamp > now - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
        }

        // Apply outlier filter if enabled
        if (outlierToggle.checked) {
            filtered = filterOutliers(filtered);
        }

        return filtered;
    }
  
    function updateVisualization() {
        const filtered = filterWorkouts();
        
        // Update stats
        document.getElementById('avgOutput').textContent = 
            Math.round(filtered.reduce((sum, w) => sum + w.output, 0) / filtered.length);
        document.getElementById('maxOutput').textContent = 
            Math.max(...filtered.map(w => w.output));
        document.getElementById('totalRides').textContent = filtered.length;

        // Calculate y-axis max dynamically
        const maxOutput = Math.max(...filtered.map(w => w.output));
        const yAxisMax = Math.ceil(maxOutput * 1.1 / 100) * 100;

        // Calculate trend line if enabled
        const trendlineData = trendlineToggle.checked ? calculateTrendLine(filtered) : null;

        // Destroy existing chart
        if (outputChart) outputChart.destroy();

        // Create datasets array
        const datasets = [{
            label: 'Output',
            data: filtered.map(w => w.output),
            borderColor: '#2667FF',
            backgroundColor: 'rgba(38, 103, 255, 0.1)',
            tension: 0.1,
            fill: true
        }];

        // Add trend line dataset if enabled
        if (trendlineData) {
            datasets.push({
                label: 'Trend Line',
                data: trendlineData,
                borderColor: '#FF4B4B',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0,
                tension: 0.4
            });
        }

        // Create output trend chart
        outputChart = new Chart(document.getElementById('outputChart'), {
            type: 'line',
            data: {
                labels: filtered.map(w => w.date),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Cycling Output Trend${durationFilter.value !== 'all' ? ` (${durationFilter.value} min rides)` : ''}`
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Output: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: Math.floor(Math.min(...filtered.map(w => w.output)) * 0.9),
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: 'Output'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                }
            }
        });
    }
  
    // Set up event listeners
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    durationFilter.addEventListener('change', updateVisualization);
    timeRange.addEventListener('change', updateVisualization);
    trendlineToggle.addEventListener('change', updateVisualization);
    outlierToggle.addEventListener('change', updateVisualization);
});